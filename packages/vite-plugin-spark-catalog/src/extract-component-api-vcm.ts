/**
 * vue-component-meta 驱动的组件 API 提取器
 *
 * 通过 Volar 类型检查器完整解析 Vue SFC，提取：
 * - Props（含完整类型解析、嵌套 schema、默认值、JSDoc）
 * - Events（含参数签名和 schema）
 *
 * 提供完整类型推导能力。
 *
 * @module extract-component-api-vcm
 * @since 2.0.0
 */

import { createChecker } from 'vue-component-meta'
import type { ComponentMetaChecker, PropertyMetaSchema } from 'vue-component-meta'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

import type {
  PropEntry,
  EmitEntry,
  PropSchema,
  PropSchemaProperty,
} from './component-catalog-schema'

/* ==========================================================================
 * VCM 提取器：创建 & 缓存 checker
 * ========================================================================== */

let _checker: ComponentMetaChecker | null = null
let _tsconfigPath: string | null = null

/**
 * 创建或复用 vue-component-meta checker
 *
 * checker 绑定 tsconfig，文件范围由 tsconfig.catalog.json 的 include 决定。
 * 同一进程内复用同一个 checker（重建开销大）。
 */
export function getOrCreateChecker(tsconfigPath: string): ComponentMetaChecker {
  if (_checker !== null && _tsconfigPath === tsconfigPath) return _checker
  _checker = createChecker(tsconfigPath, { rawType: true, schema: true })
  _tsconfigPath = tsconfigPath
  return _checker
}

/** 清除 checker 缓存（测试用） */
export function resetChecker(): void {
  _checker = null
  _tsconfigPath = null
}

/* ==========================================================================
 * 完整 API 提取
 * ========================================================================== */

export interface VcmApiDescriptor {
  /** kebab-case 注册名 */
  type: string
  /** 相对于项目 root 的文件路径 */
  filePath: string
  props: PropEntry[]
  emits: EmitEntry[]
  /** Props 是否包含索引签名 */
  hasIndexSignature: boolean
  /** 从 prop schema 树中递归发现的嵌套 object schema（如 FilterItemConfig） */
  discoveredSchemas: PropSchema[]
}

type SchemaOwner = 'workspace' | 'external'

type PropEntryWithIdentity = PropEntry & {
  __schemaIdentityKey?: string
  __schemaOwner?: SchemaOwner
}

const normalizedWorkspaceRoot = `${process.cwd().replace(/\\/g, '/').toLowerCase()}/`

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
): VcmApiDescriptor | null {
  const normalizedPath = absPath.replace(/\\/g, '/')

  try {
    const meta = checker.getComponentMeta(normalizedPath)

    // -- Props（过滤 global props 如 class/style/key/ref，以及 SparkNode 结构字段） --
    // type/props/children 是 h(type, props, children) 三段式结构键，由 SparkComponentRenderer 消费，
    // 不属于组件业务 API，从 catalog 中排除。
    const SPARK_NODE_STRUCT_KEYS = new Set(['type', 'props', 'children'])
    const discoveredSchemas: PropSchema[] = []
    const props: PropEntryWithIdentity[] = meta.props
      .filter(p => !p.global && !SPARK_NODE_STRUCT_KEYS.has(p.name))
      .map(p => {
        const entry: PropEntryWithIdentity = {
          name: p.name,
          type: p.type,
          required: p.required,
        }
        if (p.default !== undefined && p.default !== '') entry.default = p.default
        if (p.description !== '') entry.description = p.description
        // 嵌套 schema（仅当不是纯字符串时）
        const schema = convertSchema(p.schema)
        // 递归收集 enum/array 内嵌套的 object schema（如 FilterItemConfig）
        collectNestedObjectSchemas(p.schema, discoveredSchemas)
        if (schema !== undefined) {
          entry.schema = schema
          if (schema.kind === 'object') {
            const schemaIdentityKey = getRawTypeIdentityKey(p.rawType)
            if (schemaIdentityKey !== undefined) entry.__schemaIdentityKey = schemaIdentityKey
          }
          if (schema.kind === 'object' || schema.kind === 'array') {
            const schemaOwner = getRawTypeOwner(p.rawType)
            if (schemaOwner !== undefined) entry.__schemaOwner = schemaOwner
          }
        }
        return entry
      })

    // Props 索引签名检测（从源码 AST）
    const hasIndexSignature = detectIndexSignature(absPath)

    // -- Events --
    const emits: EmitEntry[] = meta.events.map(e => {
      const entry: EmitEntry = {
        name: e.name,
        type: e.type,
      }
      if (e.description !== '') entry.description = e.description
      // 事件参数 schema
      if (e.schema.length > 0) {
        const converted = e.schema.map(convertSchema).filter(isNotUndefined)
        if (converted.length > 0) {
          entry.schema = converted
        }
      }
      return entry
    })

    return {
      type: componentType,
      filePath: relativePath,
      props,
      emits,
      hasIndexSignature,
      discoveredSchemas,
    }
  } catch {
    return null
  }
}

/**
 * 批量提取多个组件
 */
export function extractAllComponentApisVcm(
  checker: ComponentMetaChecker,
  components: Array<{ absolutePath: string; relativePath: string; skillType: string }>,
): VcmApiDescriptor[] {
  const results: VcmApiDescriptor[] = []
  for (const comp of components) {
    const api = extractComponentApiVcm(
      checker,
      comp.absolutePath,
      comp.relativePath,
      comp.skillType,
    )
    if (api !== null) results.push(api)
  }
  return results
}

/* ==========================================================================
 * Schema 转换
 * ========================================================================== */

/**
 * 将 VCM 的 PropertyMetaSchema 转换为我们的 PropSchema
 *
 * 仅纯字符串类型不产生 schema 对象；其余结构以扁平形式保留。
 */
function convertSchema(vcmSchema: PropertyMetaSchema): PropSchema | undefined {
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
 * 源码 AST 辅助函数
 * ========================================================================== */

/** 从 Vue SFC 源码中提取 <script setup> 内容 */
function extractScriptSetupContent(sfcSource: string): string | null {
  const match = sfcSource.match(/<script\s+setup(?:\s+lang=["']\w+["'])?\s*>([\s\S]*?)<\/script>/)
  return match?.[1] ?? null
}

/** 检测 Props 接口是否含索引签名（从源码 AST） */
function detectIndexSignature(absPath: string): boolean {
  try {
    const sfcSource = readFileSync(absPath, 'utf-8')
    const scriptContent = extractScriptSetupContent(sfcSource)
    if (scriptContent === null) return false

    const sourceFile = ts.createSourceFile(
      `${absPath}.ts`,
      scriptContent,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )

    for (const stmt of sourceFile.statements) {
      if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === 'Props') {
        return stmt.members.some(ts.isIndexSignatureDeclaration)
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * 递归遍历 VCM schema 树，收集嵌套的 object schema。
 *
 * 当 prop 类型是联合/数组包装（如 `(string | FilterItemConfig)[] | undefined`）时，
 * 顶层 convertSchema 只提取类型字符串，内部的 object 定义被丢弃。
 * 此函数深入 enum/array 子树，找到所有 kind:'object' 节点并转换收集。
 */
function collectNestedObjectSchemas(vcmSchema: PropertyMetaSchema, collector: PropSchema[]): void {
  if (typeof vcmSchema === 'string') return

  // 只深入 enum/array/event 的子 schema 数组
  if (vcmSchema.kind !== 'object' && vcmSchema.schema !== undefined && Array.isArray(vcmSchema.schema)) {
    for (const sub of vcmSchema.schema) {
      if (typeof sub === 'string') continue
      if (sub.kind === 'object' && sub.schema !== undefined) {
        const converted = convertSchema(sub)
        if (converted !== undefined) {
          collector.push(converted)
        }
      } else {
        // 继续递归（处理多层 enum/array 嵌套）
        collectNestedObjectSchemas(sub, collector)
      }
    }
  }
}

/** 类型守卫 */
function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
