/**
 * vue-component-meta 驱动的组件 API 提取器
 *
 * 通过 Volar 类型检查器完整解析 Vue SFC，提取：
 * - Props（含完整类型解析、嵌套 schema、默认值、JSDoc）
 * - Events（含参数签名和 schema）
 * - Exposed（defineExpose 公开方法/属性）
 * - Slots（命名插槽及其 scope 类型）
 * - Capabilities（SPARK 能力链，AST 提取复用）
 *
 * 替代手写 AST 提取器，提供完整类型推导能力。
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
  CapabilityInfo,
  ExposedEntry,
  SlotEntry,
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
  _checker = createChecker(tsconfigPath)
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
  exposed: ExposedEntry[]
  slots: SlotEntry[]
  capabilities: CapabilityInfo
  /** Props 是否包含索引签名 */
  hasIndexSignature: boolean
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

    // -- Props（过滤 global props 如 class/style/key/ref） --
    const props: PropEntry[] = meta.props
      .filter(p => !p.global)
      .map(p => {
        const entry: PropEntry = {
          name: p.name,
          type: p.type,
          required: p.required,
        }
        if (p.default !== undefined && p.default !== '') entry.default = p.default
        if (p.description !== '') entry.description = p.description
        // 嵌套 schema（仅当不是纯字符串时）
        const schema = convertSchema(p.schema)
        if (schema !== undefined) entry.schema = schema
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
        entry.schema = e.schema.map(convertSchema).filter(isNotUndefined)
      }
      return entry
    })

    // -- Exposed --
    const exposed: ExposedEntry[] = meta.exposed
      .filter(e => !isVueInternalExposed(e.name))
      .map(e => {
        const entry: ExposedEntry = {
          name: e.name,
          type: e.type,
        }
        if (e.description !== '') entry.description = e.description
        const schema = convertSchema(e.schema)
        if (schema !== undefined) entry.schema = schema
        return entry
      })

    // -- Slots --
    const slots: SlotEntry[] = meta.slots.map(s => {
      const entry: SlotEntry = {
        name: s.name,
        type: s.type,
      }
      if (s.description !== '') entry.description = s.description
      const schema = convertSchema(s.schema)
      if (schema !== undefined) entry.schema = schema
      return entry
    })

    // -- Capabilities（从源码 AST 提取 SPARK 能力链） --
    const capabilities = extractCapabilitiesFromSource(absPath)

    return {
      type: componentType,
      filePath: relativePath,
      props,
      emits,
      exposed,
      slots,
      capabilities,
      hasIndexSignature,
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
 * 只保留有信息量的嵌套层级（纯字符串类型不产生 schema 对象）
 */
function convertSchema(vcmSchema: PropertyMetaSchema): PropSchema | undefined {
  if (typeof vcmSchema === 'string') {
    // 简单类型不需要 schema
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
      // 递归嵌套
      const nested = convertSchema(propMeta.schema)
      if (nested !== undefined) childSchema.schema = nested
      properties[key] = childSchema
    }
    if (hasProperties) {
      return { kind: 'object', type: vcmSchema.type, properties }
    }
  }

  if (vcmSchema.kind === 'enum' && vcmSchema.schema !== undefined) {
    const variants = vcmSchema.schema
      .map(s => (typeof s === 'string' ? s : s.type))
    if (variants.length > 0) {
      return { kind: 'enum', type: vcmSchema.type, variants }
    }
  }

  if (vcmSchema.kind === 'array' && vcmSchema.schema !== undefined) {
    const items = vcmSchema.schema
      .map(convertSchema)
      .filter(isNotUndefined)
    if (items.length > 0) {
      return { kind: 'array', type: vcmSchema.type, items }
    }
  }

  if (vcmSchema.kind === 'event' && vcmSchema.schema !== undefined) {
    const params = vcmSchema.schema
      .map(convertSchema)
      .filter(isNotUndefined)
    if (params.length > 0) {
      return { kind: 'event', type: vcmSchema.type, params }
    }
  }

  return undefined
}

/* ==========================================================================
 * Capability 提取（AST 复用）
 * ========================================================================== */

/**
 * 从 Vue SFC 源码中通过轻量 AST 提取 SPARK 能力链
 *
 * vue-component-meta 不感知 SPARK 能力系统，需要独立提取。
 */
function extractCapabilitiesFromSource(absPath: string): CapabilityInfo {
  try {
    const sfcSource = readFileSync(absPath, 'utf-8')
    const scriptContent = extractScriptSetupContent(sfcSource)
    if (scriptContent === null) return { consumes: [], provides: [] }

    const sourceFile = ts.createSourceFile(
      `${absPath}.ts`,
      scriptContent,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )

    const consumes: string[] = []
    const provides: string[] = []

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = node.expression.text
        const firstArg = node.arguments[0]

        if (fn === 'consume' && firstArg !== undefined && ts.isIdentifier(firstArg)) {
          consumes.push(firstArg.text)
        }
        if (fn === 'sparkProvide' && firstArg !== undefined && ts.isIdentifier(firstArg)) {
          provides.push(firstArg.text)
        }
        if (
          fn === 'provide' &&
          firstArg !== undefined &&
          ts.isIdentifier(firstArg) &&
          isCapabilityKeyName(firstArg.text)
        ) {
          provides.push(firstArg.text)
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return {
      consumes: [...new Set(consumes)],
      provides: [...new Set(provides)],
    }
  } catch {
    return { consumes: [], provides: [] }
  }
}

/** 判断标识符是否为 SCREAMING_SNAKE_CASE（能力键命名约定） */
function isCapabilityKeyName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name)
}

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

/** 过滤 Vue 内部 expose（非用户定义） */
function isVueInternalExposed(name: string): boolean {
  return name === '$el' || name === '$options' || name === '$forceUpdate'
    || name === '$nextTick' || name === '$watch' || name === '$parent'
    || name === '$root' || name === '$data' || name === '$props'
    || name === '$attrs' || name === '$slots' || name === '$refs'
    || name === '$emit'
}

/** 类型守卫 */
function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
