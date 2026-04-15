/**
 * vue-component-meta 驱动的组件 API 提取器
 *
 * 这个文件只负责两件事：
 * 1. 复用 vue-component-meta checker，避免重复创建带来的高成本。
 * 2. 把 VCM 返回的组件元信息整理成 component-catalog 使用的稳定结构。
 *
 * 提取范围聚焦在目录真正消费的字段：
 * - Props：名称、类型、必填、默认值、JSDoc、可选 schema
 * - Events：名称、签名、JSDoc、可选 schema
 *
 * @module extract-component-api-vcm
 * @since 2.0.0
 */

import { createChecker } from 'vue-component-meta'
import type { ComponentMetaChecker, MetaCheckerOptions, PropertyMetaSchema } from 'vue-component-meta'

import type {
  PropEntry,
  EmitEntry,
  PropSchema,
  PropSchemaProperty,
} from './component-catalog-schema'

/* ==========================================================================
 * 1) checker 缓存
 *
 * createChecker 会加载 tsconfig 并初始化完整类型系统，开销较大。
 * 这里按 tsconfigPath 做单例缓存，命中时直接复用。
 * ========================================================================== */

let _checker: ComponentMetaChecker | null = null
let _tsconfigPath: string | null = null
let _checkerOptionsKey: string | null = null

type SupportedCheckerOptions = Pick<MetaCheckerOptions, 'rawType' | 'schema' | 'noDeclarations'>

export type VcmCheckerOptions = Partial<SupportedCheckerOptions>

const DEFAULT_CHECKER_OPTIONS: SupportedCheckerOptions = {
  // 默认走 typeObject 路径，不依赖 VCM schema 展开。
  rawType: true,
  schema: false,
  noDeclarations: false,
}

function resolveCheckerOptions(options: VcmCheckerOptions): SupportedCheckerOptions {
  return {
    ...DEFAULT_CHECKER_OPTIONS,
    ...options,
  }
}

function stringifySchemaOption(schema: SupportedCheckerOptions['schema']): string {
  if (schema === undefined || typeof schema === 'boolean') return String(schema)
  const normalizedIgnores = (schema.ignore ?? [])
    .map((item) => (typeof item === 'string' ? `s:${item}` : 'f:dynamic'))
    .sort()
  return `object(${normalizedIgnores.join(',')})`
}

function buildCheckerOptionsKey(options: SupportedCheckerOptions): string {
  return `rawType:${String(options.rawType)}|schema:${stringifySchemaOption(options.schema)}|noDeclarations:${String(options.noDeclarations)}`
}

/**
 * 创建或复用 vue-component-meta checker
 *
 * checker 绑定 tsconfig，文件范围由 tsconfig.catalog.json 的 include 决定。
 * 这里默认使用 `rawType: true` + `schema: false` + `noDeclarations: false`。
 * - rawType: true 允许从 `getTypeObject()` 获取 ts.Type 做类型来源分析
 * - schema: false 不依赖 VCM schema 展开，减少目录噪音
 * - noDeclarations: false 保留声明位置信息，便于调试/溯源
 * 同一进程内复用同一个 checker（重建开销大）。
 */
export function getOrCreateChecker(
  tsconfigPath: string,
  checkerOptions: VcmCheckerOptions = {},
): ComponentMetaChecker {
  const resolvedCheckerOptions = resolveCheckerOptions(checkerOptions)
  const optionsKey = buildCheckerOptionsKey(resolvedCheckerOptions)

  if (_checker !== null && _tsconfigPath === tsconfigPath && _checkerOptionsKey === optionsKey) {
    return _checker
  }

  _checker = createChecker(tsconfigPath, resolvedCheckerOptions)
  _tsconfigPath = tsconfigPath
  _checkerOptionsKey = optionsKey
  return _checker
}

/** 清除 checker 缓存（测试用） */
export function resetChecker(): void {
  _checker = null
  _tsconfigPath = null
  _checkerOptionsKey = null
}

/* ==========================================================================
 * 2) 提取结果结构
 * ========================================================================== */

export interface VcmApiDescriptor {
  /** kebab-case 注册名 */
  type: string
  /** 相对于项目 root 的文件路径 */
  filePath: string
  props: PropEntry[]
  emits: EmitEntry[]
}

export interface ExtractComponentApiVcmOptions {
  /** 是否保留 VCM 注入的全局 props（class/style/key/ref 等） */
  includeGlobalProps?: boolean
}

type SchemaOwner = 'workspace' | 'external'

type PropEntryWithIdentity = PropEntry & {
  __schemaIdentityKey?: string
  __schemaOwner?: SchemaOwner
  __componentRef?: string
}

const normalizedWorkspaceRoot = `${process.cwd().replace(/\\/g, '/').toLowerCase()}/`

/* ==========================================================================
 * 3) 消费 VCM rawType
 *
 * rawType 不是这里额外推导出来的，而是 VCM 在 `rawType: true` 时原生提供的底层 TS 类型对象。
 * 当前主流程已固定为 `rawType: false`，本节逻辑仅保留兼容/实验用途。
 * VCM 自带的 schema 有时不足以区分“工作区内类型”与“外部依赖类型”，
 * 所以这里继续消费 rawType，追溯声明文件并整理出两类辅助信息：
 * - owner：类型来源于 workspace 还是 external
 * - identityKey：对象 schema 的稳定身份标识
 * ========================================================================== */

function getRawTypeDeclarationFiles(rawType: unknown): string[] {
  if (rawType === null || typeof rawType !== 'object') return []

  const symbols = [
    (rawType as { symbol?: { declarations?: Array<{ getSourceFile?: () => { fileName?: string } }> } }).symbol,
    (rawType as { aliasSymbol?: { declarations?: Array<{ getSourceFile?: () => { fileName?: string } }> } }).aliasSymbol,
  ].filter((value): value is { declarations?: Array<{ getSourceFile?: () => { fileName?: string } }> } => value !== undefined)

  const files: string[] = []
  for (const symbol of symbols) {
    for (const declaration of symbol.declarations ?? []) {
      const sourceFile = declaration.getSourceFile?.()
      const fileName = sourceFile?.fileName
      if (typeof fileName === 'string' && fileName.length > 0) {
        files.push(fileName.replace(/\\/g, '/'))
      }
    }
  }
  return [...new Set(files)]
}

function getRawTypeOwner(rawType: unknown): SchemaOwner | undefined {
  const declarationFiles = getRawTypeDeclarationFiles(rawType)
  if (declarationFiles.length === 0) return undefined

  const hasWorkspaceDeclaration = declarationFiles.some((filePath) => {
    const normalizedPath = filePath.toLowerCase()
    return normalizedPath.startsWith(normalizedWorkspaceRoot) && !normalizedPath.includes('/node_modules/')
  })
  return hasWorkspaceDeclaration ? 'workspace' : 'external'
}

function getRawTypeIdentityKey(rawType: unknown): string | undefined {
  if (rawType === null || typeof rawType !== 'object') return undefined

  const rawTypeId = (rawType as { id?: unknown }).id
  return typeof rawTypeId === 'number' ? `ts:${rawTypeId}` : undefined
}

/* ==========================================================================
 * 4) 对外提取入口
 *
 * extractComponentApiVcm：提取单个组件
 * extractAllComponentApisVcm：批量提取组件
 * ========================================================================== */

/**
 * 使用 vue-component-meta 提取单个组件的完整 API
 *
 * @param checker    - VCM checker 实例
 * @param absPath    - Vue 文件绝对路径（正斜杠）
 * @param relativePath - 相对路径（用于输出）
 * @param componentType - 组件注册名（kebab-case）
 */
export function extractComponentApiVcm(
  checker: ComponentMetaChecker,
  absPath: string,
  relativePath: string,
  componentType: string,
  options: ExtractComponentApiVcmOptions = {},
): VcmApiDescriptor | null {
  const normalizedPath = absPath.replace(/\\/g, '/')
  const { includeGlobalProps = false } = options

  try {
    const meta = checker.getComponentMeta(normalizedPath)

    // 默认过滤 VCM 自动注入的全局 props，例如 class/style/key/ref。
    // 同时过滤带 @internal JSDoc 标签的 props（由 Vue 源码声明，不属于配置层面）。
    // 另外剔除 TSX 监听器透传伪属性（onUpdate:*），避免与 emits 重复污染目录。
    const sourceProps = (includeGlobalProps ? meta.props : meta.props.filter(p => !p.global))
      .filter(p => !p.tags.some(t => t.name === 'internal'))
      .filter(p => !p.name.startsWith('onUpdate:'))
    const props: PropEntryWithIdentity[] = sourceProps.map(buildPropEntry)

    const emits: EmitEntry[] = meta.events.map(buildEmitEntry)

    return {
      type: componentType,
      filePath: relativePath,
      props,
      emits,
    }
  } catch {
    return null
  }
}

/**
 * 批量提取多个组件。
 *
 * 保持“单组件失败不拖垮全量生成”的策略：
 * 某个组件解析失败时，extractComponentApiVcm 会返回 null，这里直接跳过。
 */
export function extractAllComponentApisVcm(
  checker: ComponentMetaChecker,
  components: Array<{ absolutePath: string; relativePath: string; skillType: string }>,
  options: ExtractComponentApiVcmOptions = {},
): VcmApiDescriptor[] {
  const results: VcmApiDescriptor[] = []
  for (const comp of components) {
    const api = extractComponentApiVcm(
      checker,
      comp.absolutePath,
      comp.relativePath,
      comp.skillType,
      options,
    )
    if (api !== null) results.push(api)
  }
  return results
}

/* ==========================================================================
 * 5) props / emits 组装
 *
 * 这一层把 VCM 元信息收敛为 catalog 需要的字段，保持“只保留目录实际消费的值”。
 * ========================================================================== */

function buildPropEntry(p: {
  name: string
  type: string
  required: boolean
  default?: string | undefined
  description: string
  tags: Array<{ name: string; text?: string }>
  schema?: PropertyMetaSchema
  rawType?: unknown
  getTypeObject?: (() => unknown) | undefined
}): PropEntryWithIdentity {
  const entry: PropEntryWithIdentity = {
    name: p.name,
    type: p.type,
    required: p.required,
  }

  if (p.default !== undefined && p.default !== '') entry.default = p.default
  if (p.description !== '') entry.description = p.description

  // @componentRef tag — 由 JSDoc 声明该 prop 引用的组件类型
  const componentRefTag = p.tags.find(t => t.name === 'componentRef')
  if (componentRefTag?.text !== undefined && componentRefTag.text.trim() !== '') {
    entry.__componentRef = componentRefTag.text.trim()
  }

  const typeObject = resolveTypeObject(p)

  // schema 为纯字符串时不落盘；只有真正的结构信息才保留。
  const schema = convertSchema(p.schema)
  if (schema === undefined) return entry

  entry.schema = schema

  // 这里不是生成 rawType，而是消费 VCM 已经给出的 rawType，提取稳定身份。
  if (schema.kind === 'object') {
    const schemaIdentityKey = getRawTypeIdentityKey(typeObject)
    if (schemaIdentityKey !== undefined) entry.__schemaIdentityKey = schemaIdentityKey
  }

  // 对象 / 数组 schema 才有继续利用 rawType 追踪来源的意义。
  if (schema.kind === 'object' || schema.kind === 'array') {
    const schemaOwner = getRawTypeOwner(typeObject)
    if (schemaOwner !== undefined) entry.__schemaOwner = schemaOwner
  }

  return entry
}

function resolveTypeObject(p: { rawType?: unknown; getTypeObject?: (() => unknown) | undefined }): unknown {
  if (typeof p.getTypeObject === 'function') {
    try {
      return p.getTypeObject()
    } catch {
      // ignore and fallback to rawType
    }
  }
  return p.rawType
}

function buildEmitEntry(e: {
  name: string
  type: string
  description: string
  schema?: PropertyMetaSchema[]
}): EmitEntry {
  const entry: EmitEntry = {
    name: e.name,
    type: e.type,
  }

  if (e.description !== '') entry.description = e.description

  // 事件参数 schema 是数组；逐项转换后仅保留有效结构。
  if (Array.isArray(e.schema) && e.schema.length > 0) {
    const converted = e.schema.map(convertSchema).filter(isNotUndefined)
    if (converted.length > 0) entry.schema = converted
  }

  return entry
}

/* ==========================================================================
 * 6) schema 转换
 *
 * VCM 的 PropertyMetaSchema 是一个通用联合结构，这里只投影出 catalog 需要的四类：
 * object / enum / array / event。
 * ========================================================================== */

/**
 * 将 VCM 的 PropertyMetaSchema 转换为我们的 PropSchema
 *
 * 设计约束：
 * - 纯字符串类型不生成 schema，避免无意义噪音
 * - object 只保留一层 properties，避免把目录变成深度结构镜像
 * - enum / array / event 只保留消费侧真正需要的关键信息
 */
function convertSchema(vcmSchema: PropertyMetaSchema | undefined): PropSchema | undefined {
  if (vcmSchema === undefined) {
    return undefined
  }

  if (typeof vcmSchema === 'string') {
    return undefined
  }

  if (vcmSchema.kind === 'object' && vcmSchema.schema !== undefined) {
    const properties: Record<string, PropSchemaProperty> = {}
    let hasProperties = false
    for (const [key, propMeta] of Object.entries(vcmSchema.schema)) {
      hasProperties = true
      const childSchema: PropSchemaProperty = {
        name: propMeta.name,
        type: propMeta.type,
        required: propMeta.required,
      }
      if (propMeta.description !== '') childSchema.description = propMeta.description
      properties[key] = childSchema
    }
    if (hasProperties) {
      return { kind: 'object', type: vcmSchema.type, properties }
    }
  }

  if (vcmSchema.kind === 'enum' && vcmSchema.schema !== undefined) {
    const variants = uniqueSchemaTypes(vcmSchema.schema)
    if (variants.length > 0) {
      return { kind: 'enum', type: vcmSchema.type, variants }
    }
  }

  if (vcmSchema.kind === 'array' && vcmSchema.schema !== undefined) {
    const itemTypes = uniqueSchemaTypes(vcmSchema.schema)
    if (itemTypes.length > 0) {
      return { kind: 'array', type: vcmSchema.type, itemTypes }
    }
  }

  if (vcmSchema.kind === 'event' && vcmSchema.schema !== undefined) {
    const paramTypes = uniqueSchemaTypes(vcmSchema.schema)
    if (paramTypes.length > 0) {
      return { kind: 'event', type: vcmSchema.type, paramTypes }
    }
  }

  return undefined
}

function uniqueSchemaTypes(schemas: PropertyMetaSchema[]): string[] {
  const values = schemas
    .map((schema) => (typeof schema === 'string' ? schema : schema.type))
    .filter((value) => value.length > 0)
  return [...new Set(values)]
}

/* ==========================================================================
 * 7) 通用小工具
 * ========================================================================= */

/** 过滤掉 undefined，便于数组链式处理中保留精确类型。 */
function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
