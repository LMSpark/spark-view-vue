/**
 * JSON 组件目录生成器
 *
 * 职责：
 * 1. 扫描 SPARK 组件源码；
 * 2. 通过 VCM 提取组件 Props / Emits / 元数据；
 * 3. 对高重复结构做共享池化与字典去重；
 * 4. 产出 component-catalog.json 作为组件目录单一事实源。
 *
 * 设计原则：
 * - 运行时模型保留完整信息，便于审计与后续扩展；
 * - 落盘前再做瘦身，避免把内部辅助信息直接写入产物；
 * - 通过治理契约与 canonical 字典，为 AI 和工具链提供稳定消费面。
 */

// ── 1. 依赖导入 (Imports) ─────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { globSync } from 'glob'
import { getOrCreateChecker, extractComponentApiVcm } from './extract-component-api-vcm'
import type { VcmCheckerOptions } from './extract-component-api-vcm'
import {
  toKebabCase,
  inferSkillType,
  createLogger,
  parseSkillMeta,
  normalizePath,
} from './utils'
import type {
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PropEntry,
  EmitEntry,
  PropSchema,
  PropSchemaProperty,
  CatalogBindingDescriptor,
  CatalogCanonicalModel,
  CatalogCanonicalComponent,
} from './component-catalog-schema'
import { auditCatalog, logAuditReport } from './catalog-quality-audit'
import type { AuditReport, AuditOptions } from './catalog-quality-audit'

import { nestedSchemaCollector } from './nested-schema-collector'
import { deepClone } from '@spark-view/spark-utils'
// ── 2. 常量与生成约束 (Constants & Policies) ───────────────────────────────────────

/** 统一日志前缀，方便从构建日志里快速筛出目录生成阶段输出。 */
const logger = createLogger('spark-catalog-json')

/** 组件目录标准产物文件名。 */
const CANONICAL_CATALOG_FILE = 'component-catalog.json'

// ── 3. 外部参数与内部工作上下文 (Options & Internal Contexts) ────────────────────

/**
 * 目录生成器的外部输入参数。
 *
 * 这些选项用于控制：
 * - 扫描哪些组件文件；
 * - 是否包含全局 Props；
 * - 使用哪个 tsconfig 建立类型检查器；
 * - 是否执行目录质量审计。
 */
export interface JsonCatalogOptions {
  featurePatterns?: string[] | undefined
  exclude?: string[] | undefined
  tsconfigPath?: string | undefined
  verbose?: boolean | undefined
  includeGlobalProps?: boolean | undefined
  vcmCheckerOptions?: VcmCheckerOptions | undefined
  /** 质量审计选项（传入则自动运行审计） */
  audit?: AuditOptions | boolean | undefined
}

/**
 * 计算标准目录输出路径。
 *
 * component-catalog.json 是当前仓库组件目录的单一事实源，所有消费者都应从该路径读取。
 */
export function getCanonicalCatalogOutputPath(root: string): string {
  return resolve(root, 'packages/spark-ai/src/registrations/page-design/payloads', CANONICAL_CATALOG_FILE)
}

type SchemaOwner = 'workspace' | 'external'

/**
 * 带内部元信息的 PropEntry。
 *
 * 这些字段只在生成阶段使用，不应直接写入最终 JSON。
 */
interface PropEntryWithMeta extends PropEntry {
  __schemaIdentityKey?: string
  __schemaOwner?: SchemaOwner
  __componentRef?: string
  /** 自动提取的字符串字面量枚举 variants（已用引号包裹） */
  __enumVariants?: string[]
}

/** 共享 schema 池的构建上下文，用于分配稳定 ref 并做去重。 */
interface SchemaPoolContext {
  index: Map<string, string>
  pool: Record<string, PropSchema>
  sequence: number
}

/** canonical 字典上下文，用于把重复 props / emits 提升成全局字典项。 */
interface CanonicalDictionaryContext {
  propIndex: Map<string, string>
  emitIndex: Map<string, string>
  props: Record<string, PropEntry>
  emits: Record<string, EmitEntry>
  propSequence: number
  emitSequence: number
}

/**
 * 结构性属性不再保留在组件 props 列表里。
 *
 * 它们会通过治理契约表达，避免每个组件重复写出同样的低信息量字段。
 */
const STRUCTURAL_PROP_NAMES = new Set(['type', 'id', 'children'])

/**
 * 低信息量枚举变体。
 *
 * 这类枚举通常只是宽泛基础类型的文字化表达，不足以支撑真实配置语义，写入目录只会制造噪音。
 */
const LOW_SIGNAL_ENUM_VARIANTS = new Set([
  'undefined',
  'null',
  'string',
  'number',
  'boolean',
  'object',
  'unknown',
  'any',
  'never',
  'void',
])

/**
 * 外部系统对象或 DOM/CSS 相关类型。
 *
 * 这些类型往往会展开成大量对业务无帮助的字段，因此不应进入 schemaPool。
 */
const LOW_SIGNAL_OBJECT_SCHEMA_TYPES = new Set([
  'Event',
  'UIEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'PointerEvent',
  'WheelEvent',
  'InputEvent',
  'SubmitEvent',
  'EventTarget',
  'Window',
  'Document',
  'Element',
  'HTMLElement',
  'Node',
  'CSSProperties',
  'CSSStyleDeclaration',
])

/**
 * 顶层目录约束。
 *
 * 这里保存的是消费者需要共享遵循的平台规则，例如 DataKey 正则、容器上下文映射、
 * 有效组件类型前缀等。它们属于目录的一部分，而不是临时构建细节。
 */
const DEFAULT_CONSTRAINTS: ComponentCatalog['constraints'] = {
  dataKeyPattern: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|aggregateResult|selectionAggregateResult)(\.[\w.]+)?$`,
  validTypePrefixes: ['r-', 'spark-'],
  validAggregateTypes: ['sum', 'count', 'avg', 'min', 'max', 'join'],
  nonFieldRTypes: ['r-table', 'r-form', 'r-detail', 'r-tree', 'r-list'],
  containerContextMap: {
    'r-table': 'table',
    'r-form': 'form',
    'r-detail': 'detail',
    'r-tree': 'tree',
    'r-list': 'list',
  },
  nestingRules: {},
}

// ── 4. 键池与上下文工厂 (Context Factories) ───────────────────────────────────────

/** 创建 schemaPool 构建上下文。 */
function createSchemaPoolContext(): SchemaPoolContext {
  return {
    index: new Map<string, string>(),
    pool: {},
    sequence: 0,
  }
}

/** 创建 canonical 字典上下文。 */
function createCanonicalDictionaryContext(): CanonicalDictionaryContext {
  return {
    propIndex: new Map<string, string>(),
    emitIndex: new Map<string, string>(),
    props: {},
    emits: {},
    propSequence: 0,
    emitSequence: 0,
  }
}

/** 生成新的 prop 字典键，保持稳定的递增编号。 */
function allocCanonicalPropKey(context: CanonicalDictionaryContext): string {
  context.propSequence += 1
  return `prop_${String(context.propSequence).padStart(5, '0')}`
}

/** 生成新的 emit 字典键，保持稳定的递增编号。 */
function allocCanonicalEmitKey(context: CanonicalDictionaryContext): string {
  context.emitSequence += 1
  return `emit_${String(context.emitSequence).padStart(5, '0')}`
}

/** 为共享 schema 分配 ref 键。 */
function allocSchemaKey(context: SchemaPoolContext): string {
  context.sequence += 1
  return `schema_${String(context.sequence).padStart(5, '0')}`
}

/**
 * 把值追加到数组中，并保持数组唯一性与原始遇见顺序。
 *
 * registry 分类列表希望既去重，又尽量反映稳定扫描顺序。
 */
function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value)
}

// ── 5. 命名规范与组件特征推断 (Naming & Inference) ───────────────────────────────

/**
 * 推断组件所属分类。
 *
 * 优先尊重显式 skillMeta 配置；如果没有，再依据文件路径回退推断。
 */
function inferCategory(filePath: string, explicitCategory?: string): ComponentEntry['category'] {
  if (explicitCategory === 'container' || explicitCategory === 'field' || explicitCategory === 'group' || explicitCategory === 'meta' || explicitCategory === 'feature') {
    return explicitCategory
  }

  if (filePath.includes('/components/containers/')) return 'container'
  if (filePath.includes('/components/fields/')) return 'field'
  if (filePath.includes('/features/')) return 'feature'
  return 'feature'
}

/**
 * 从 props 反推当前组件的绑定能力描述。
 *
 * 这里的目标不是做完全精确的类型系统推理，而是给目录消费者提供“够用且稳定”的行为标签。
 */
function inferBinding(props: PropEntry[]): CatalogBindingDescriptor | undefined {
  const names = new Set(props.map((prop) => prop.name))
  const descriptor: CatalogBindingDescriptor = {}

  if (names.has('dataKey')) {
    descriptor.selfResolving = true
    descriptor.dataContainer = true
  }
  if (names.has('field')) descriptor.fieldProvider = true
  if (names.has('options') || names.has('optionKey')) descriptor.hasOptions = true

  const modelValue = props.find((prop) => prop.name === 'modelValue')
  if (modelValue?.type.includes('boolean') === true) descriptor.valueType = 'boolean'
  else if (modelValue?.type.includes('[]') === true || modelValue?.type.includes('Array') === true) descriptor.valueType = 'array'
  else if (modelValue !== undefined) descriptor.valueType = 'string'

  if (names.has('field')) descriptor.bindingDelegate = 'form-element'
  if (names.has('dataKey') && names.has('children')) descriptor.bindingDelegate = 'table'

  return Object.keys(descriptor).length > 0 ? descriptor : undefined
}

/**
 * 稳定序列化任意 JSON 形对象。
 *
 * 用于把结构相同但键顺序不同的对象归并成同一 dedupe key。
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/** 判断属性描述是否只是 MDN 引用噪音。 */
function isMdnPropertyDescription(text?: string): boolean {
  return typeof text === 'string' && text.includes('MDN Reference')
}

/**
 * 判断对象 schema 是否属于低信息量外部对象。
 *
 * 典型场景是 DOM Event/CSSProperties 这类系统类型，如果直接展开会污染 catalog。
 */
function isLowSignalObjectSchema(schema: Extract<PropSchema, { kind: 'object' }>): boolean {
  if (LOW_SIGNAL_OBJECT_SCHEMA_TYPES.has(schema.type)) return true

  const properties = Object.values(schema.properties)
  if (properties.length < 5) return false

  const mdnLikeCount = properties.filter((property) => isMdnPropertyDescription(property.description)).length
  return mdnLikeCount === properties.length
}

/**
 * 判断 schema 是否值得保留到共享池。
 *
 * 过滤策略以“是否提供真实配置价值”为准，而不是单纯看 schema 是否存在。
 */
function shouldRetainSchema(schema: PropSchema): boolean {
  if (schema.kind === 'object' && isLowSignalObjectSchema(schema)) {
    return false
  }

  if (schema.kind === 'enum') {
    const hasLiteralVariant = schema.variants.some((variant) =>
      /^".*"$/.test(variant) || /^'.*'$/.test(variant),
    )
    if (!hasLiteralVariant) {
      return !schema.variants.every((variant) => LOW_SIGNAL_ENUM_VARIANTS.has(variant))
    }
  }
  return true
}

/**
 * 为 schema 获取稳定 ref。
 *
 * 如果上游已经提供 identityKey，则优先按 identity 去重；否则回退到结构序列化去重。
 */
function resolveSchemaRef(
  context: SchemaPoolContext,
  schema: PropSchema,
  identityKey?: string,
): string {
  const schemaKey = `schema:${stableStringify(schema)}`
  const normalizedIdentityKey = identityKey?.trim()
  const identityDedupeKey = normalizedIdentityKey && normalizedIdentityKey.length > 0
    ? `identity:${normalizedIdentityKey}`
    : undefined

  if (identityDedupeKey !== undefined) {
    const byIdentity = context.index.get(identityDedupeKey)
    if (byIdentity !== undefined) return byIdentity
  }

  const bySchema = context.index.get(schemaKey)
  if (bySchema !== undefined) {
    if (identityDedupeKey !== undefined) {
      context.index.set(identityDedupeKey, bySchema)
    }
    return bySchema
  }

  const ref = allocSchemaKey(context)
  context.index.set(schemaKey, ref)
  if (identityDedupeKey !== undefined) {
    context.index.set(identityDedupeKey, ref)
  }
  context.pool[ref] = schema
  return ref
}

function normalizeNestedSchemaProperty(
  context: SchemaPoolContext,
  property: PropSchemaProperty,
  fallbackIdentityKey: string,
): PropSchemaProperty {
  const normalizedProperty: PropSchemaProperty = { ...property }
  const nestedSchema = property.__nestedSchema

  if (nestedSchema === undefined) {
    return normalizedProperty
  }

  const normalizedNestedSchema = normalizeNestedSchema(context, nestedSchema)
  normalizedProperty.schemaRef = resolveSchemaRef(
    context,
    normalizedNestedSchema,
    property.type || fallbackIdentityKey,
  )
  delete normalizedProperty.__nestedSchema
  return normalizedProperty
}

function normalizeNestedSchema(context: SchemaPoolContext, schema: PropSchema): PropSchema {
  if (schema.kind !== 'object') {
    return schema
  }

  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([propertyName, property]) => [
        propertyName,
        normalizeNestedSchemaProperty(context, property, propertyName),
      ]),
    ),
  }
}

// ── 6. 组件条目压缩与 canonical 建模 (Compaction & Canonical Model) ───────────────

/**
 * 紧凑化组件 props。
 *
 * 处理策略：
 * - 移除结构性 props；
 * - 保留基础展示字段；
 * - 复杂 schema 提升为 schemaRef；
 * - 若存在组件引用，则优先写 component:xxx 形式引用。
 */
function compactProps(rawProps: PropEntryWithMeta[], schemaPool: SchemaPoolContext): PropEntry[] {
  const result: PropEntry[] = []

  for (const prop of rawProps) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue

    const compacted: PropEntry = {
      name: prop.name,
      type: prop.type,
      required: prop.required,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
    }

    // 语义标签：@componentRef 始终以独立字段落盘，不再与结构 schema 互斥。
    if (prop.__componentRef !== undefined) {
      compacted.componentRef = prop.__componentRef
    }

    // 结构 schema 优先级：
    // 1) VCM 抽取出的真实结构（object/array）——首选；
    // 2) rawType 提取的命名字面量 enum（InlineAlign 等）；
    // 当上述两类都缺失而仅存在 @componentRef 时，schemaRef 留空——
    // 消费层通过独立的 componentRef 字段定位目标组件，无需再写入旧的
    // `component:xxx` 占位（消费层已 fail-fast 拒绝）。
    let schemaResolved = false
    if (prop.schema !== undefined) {
      const normalizedSchema = normalizeNestedSchema(schemaPool, prop.schema)
      const isExternalObjectSchema = prop.schema.kind === 'object' && prop.__schemaOwner === 'external'
      if (!isExternalObjectSchema && shouldRetainSchema(normalizedSchema)) {
        compacted.schemaRef = resolveSchemaRef(schemaPool, normalizedSchema, prop.__schemaIdentityKey)
        schemaResolved = true
      }
    }
    if (!schemaResolved && prop.__enumVariants !== undefined && prop.__enumVariants.length > 0) {
      const enumType = prop.type.replace(/\s*\|\s*undefined\s*$/, '').trim()
      const enumSchema: PropSchema = { kind: 'enum', type: enumType, variants: prop.__enumVariants }
      compacted.schemaRef = resolveSchemaRef(schemaPool, enumSchema)
    }
    result.push(compacted)
  }

  return result
}

/**
 * 紧凑化 emits。
 *
 * 与 props 类似，事件 payload 的复杂类型也会提升为共享 schema 引用，避免每个组件重复展开。
 */

function compactEmits(rawEmits: EmitEntry[], schemaPool: SchemaPoolContext): EmitEntry[] {
  const result: EmitEntry[] = []

  for (const emit of rawEmits) {
    const compacted: EmitEntry = {
      name: emit.name,
      ...(emit.type !== undefined ? { type: emit.type } : {}),
      ...(emit.description !== undefined ? { description: emit.description } : {}),
    }

    if (emit.schema !== undefined && emit.schema.length > 0) {
      const refs: string[] = []
      for (const schema of emit.schema) {
        if (!shouldRetainSchema(schema)) continue
        refs.push(resolveSchemaRef(schemaPool, schema))
      }
      if (refs.length > 0) compacted.schemaRefs = [...new Set(refs)]
    }

    result.push(compacted)
  }

  return result
}

/** 把单个 prop 提升到 canonical 字典，并返回对应 ref。 */
function getCanonicalPropRef(context: CanonicalDictionaryContext, prop: PropEntry): string {
  const key = stableStringify(prop)
  const existing = context.propIndex.get(key)
  if (existing !== undefined) return existing

  const ref = allocCanonicalPropKey(context)
  context.propIndex.set(key, ref)
  context.props[ref] = prop
  return ref
}

/** 把单个 emit 提升到 canonical 字典，并返回对应 ref。 */
function getCanonicalEmitRef(context: CanonicalDictionaryContext, emit: EmitEntry): string {
  const key = stableStringify(emit)
  const existing = context.emitIndex.get(key)
  if (existing !== undefined) return existing

  const ref = allocCanonicalEmitKey(context)
  context.emitIndex.set(key, ref)
  context.emits[ref] = emit
  return ref
}

/**
 * 将运行态组件条目转换为 canonical 组件视图。
 *
 * canonical 视图的重点是用 propRefs / emitRefs 指向全局字典，减少重复并提供更稳定的 AI 消费接口。
 */
function toCanonicalComponent(
  entry: ComponentEntry,
  propRefs: string[],
  emitRefs: string[],
): CatalogCanonicalComponent {
  return {
    type: entry.type,
    category: entry.category,
    description: entry.description,
    ...(entry.filePath !== undefined ? { filePath: entry.filePath } : {}),
    propRefs,
    emitRefs,
    source: entry.source,
    ...(entry.binding !== undefined ? { binding: entry.binding } : {}),
  }
}

/**
 * 生成用于写盘的 payload。
 *
 * 运行态 catalog 会保留更多内部字段，但磁盘产物需要做瘦身：
 * - components.* 删除 emits/source/binding；
 * - canonical.components.* 删除 source/binding。
 *
 * 这样既保留运行态信息，又维持落盘 JSON 的稳定与紧凑。
 */
function createCatalogFilePayload(catalog: ComponentCatalog): unknown {
  const payload = deepClone(catalog) as unknown as {
    components?: Record<string, Record<string, unknown>>
    canonical?: { components?: Record<string, Record<string, unknown>> }
  }

  const components = payload.components
  if (components !== undefined) {
    for (const entry of Object.values(components)) {
      delete entry['emits']
      delete entry['source']
      delete entry['binding']
    }
  }

  const canonicalComponents = payload.canonical?.components
  if (canonicalComponents !== undefined) {
    for (const entry of Object.values(canonicalComponents)) {
      delete entry['source']
      delete entry['binding']
    }
  }

  return payload
}

// ── 7. 组件扫描与目录构建 (Scanner & Builder) ─────────────────────────────────────

/**
 * 扫描输入文件并构建完整目录模型。
 *
 * 该阶段负责：
 * - 建立 TS / Vue 检查器；
 * - 提取每个组件的 VCM API；
 * - 生成组件条目、registry、bindingDescriptors、schemaPool；
 * - 额外输出 canonical 视图，供 AI 和高级工具消费。
 */
function buildSortedComponents(
  root: string,
  files: string[],
  includeGlobalProps: boolean,
  tsconfigPath: string,
  checkerOptions: VcmCheckerOptions,
) {
  const checker = getOrCreateChecker(resolve(root, tsconfigPath).replace(/\\/g, '/'), checkerOptions)

  const components: Record<string, ComponentEntry> = {}
  const registry: ComponentRegistry = {
    containers: [],
    fields: [],
    groups: [],
    meta: [],
  }
  const bindingDescriptors: Record<string, CatalogBindingDescriptor> = {}
  const schemaPool = createSchemaPoolContext()
  const canonical = createCanonicalDictionaryContext()
  const canonicalComponents: Record<string, CatalogCanonicalComponent> = {}

  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b))

  for (const file of sortedFiles) {
    const abs = resolve(root, file)

    // 组件 type 统一来源于推断后的 kebab-case 名称；无法识别的文件直接跳过。
    const type = inferSkillType(abs, toKebabCase(basename(file, '.vue')))
    if (type === null) continue

    // 通过 VCM 抽取组件 API 明细；抽取失败说明该文件不属于可索引组件。
    const vcmApi = extractComponentApiVcm(checker, abs, file, type, { includeGlobalProps })
    if (vcmApi === null) continue

    const rawProps = vcmApi.props as PropEntryWithMeta[]
    const skillMeta = parseSkillMeta(abs, type)
    const explicitSkillMeta = parseSkillMeta(abs, type, { requireSkillTag: true })
    const normalizedFilePath = normalizePath(vcmApi.filePath)
    const category = inferCategory(normalizedFilePath, skillMeta?.category)

    const props = compactProps(rawProps, schemaPool)
    const emits = compactEmits(vcmApi.emits, schemaPool)
    const binding = inferBinding(props)
    const entry: ComponentEntry = {
      type,
      filePath: normalizedFilePath,
      category,
      description: skillMeta?.description ?? `SPARK 组件：${type}`,
      props,
      emits,
      source: explicitSkillMeta === null ? 'vcm' : 'vcm+meta',
      ...(binding !== undefined ? { binding } : {}),
    }

    components[type] = entry

  // 同步构建 canonical 组件视图，避免后处理时再次遍历和去重。
    const propRefs = props.map((prop) => getCanonicalPropRef(canonical, prop))
    const emitRefs = emits.map((emit) => getCanonicalEmitRef(canonical, emit))
    canonicalComponents[type] = toCanonicalComponent(entry, propRefs, emitRefs)

  // registry 只记录分类索引，便于消费者快速按类筛选。
    if (category === 'container') pushUnique(registry.containers, type)
    else if (category === 'field') pushUnique(registry.fields, type)
    else if (category === 'group') pushUnique(registry.groups, type)
    else if (category === 'meta') pushUnique(registry.meta, type)

    if (binding !== undefined) bindingDescriptors[type] = binding
  }

  registry.containers.sort()
  registry.fields.sort()
  registry.groups.sort()
  registry.meta.sort()

  // 递归处理所有嵌套 schema（如 ActionsNode.props 中的结构化对象类型）
  // 这些在 convertSchema 过程中被识别出来，需要提取为独立的 schema 池条目
  const nestedSchemas = nestedSchemaCollector.getAll()
  for (const record of nestedSchemas) {
    // 使用类型名称作为 identity key，以便生成稳定的 schema ref
    const identityKey = record.typeName.trim()
    resolveSchemaRef(
      schemaPool,
      normalizeNestedSchema(schemaPool, record.schema),
      identityKey.length > 0 ? identityKey : undefined,
    )
  }
  // 清空收集器，为下一次调用做准备
  nestedSchemaCollector.clear()

  return {
    components,
    registry,
    bindingDescriptors,
    schemaPool: schemaPool.pool,
    canonical: {
      dictionaries: {
        props: canonical.props,
        emits: canonical.emits,
      },
      components: canonicalComponents,
    } as CatalogCanonicalModel,
  }
}

// ── 8. 顶层生成入口 (Public Entry) ─────────────────────────────────────────────────

/**
 * 生成组件 JSON 目录并按需执行质量审计。
 *
 * 顶层流程：
 * 1. 按模式扫描目标 Vue 文件；
 * 2. 构建组件目录运行态模型；
 * 3. 补齐 constraints / canonical 等顶层信息；
 * 4. 生成瘦身后的落盘 payload 并写入标准路径；
 * 5. 若配置了 audit，则输出质量审计报告。
 */
export function generateJsonCatalog(root: string, options: JsonCatalogOptions = {}) {
  const {
    featurePatterns = [],
    exclude = [],
    tsconfigPath = 'tsconfig.catalog.json',
    includeGlobalProps = false,
    vcmCheckerOptions = {},
    audit,
  } = options

  // 当前默认只扫描容器与字段组件；featurePatterns 用于向外扩展额外扫描入口。
  const patterns = ['./packages/spark-component/src/components/containers/**/Renderer*.vue',
    './packages/spark-component/src/components/fields/**/Field*.vue', ...featurePatterns]
  const files = patterns.flatMap(p => globSync(p, { cwd: root, absolute: false, ignore: exclude }))

  const {
    components,
    registry,
    bindingDescriptors,
    schemaPool,
    canonical,
  } = buildSortedComponents(root, files, includeGlobalProps, tsconfigPath, vcmCheckerOptions)

  // 运行态 catalog 保留完整字段，供审计和调用方继续加工。
  const catalog: ComponentCatalog = {
    version: '2.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(components).length,
    registry,
    sharedTypes: {},
    components,
    ...(Object.keys(schemaPool).length > 0 ? { schemaPool } : {}),
    constraints: DEFAULT_CONSTRAINTS,
    canonical,
    bindingDescriptors,
  }

  // 真正写盘前统一做 payload 瘦身，避免把内部辅助字段直接暴露给目录消费者。
  const filePayload = createCatalogFilePayload(catalog)

  const outPath = getCanonicalCatalogOutputPath(root)
  writeFileSync(outPath, JSON.stringify(filePayload, null, 2), 'utf-8')
  logger.info(`📦 ${catalog.componentCount} 组件已写入`)

  // 质量审计属于后置能力：目录本身先生成，再决定是否做结构质量分析。
  let auditReport: AuditReport | undefined
  if (audit !== undefined && audit !== false) {
    const auditOptions = typeof audit === 'object' ? audit : {}
    auditReport = auditCatalog(catalog, auditOptions)
    logAuditReport(auditReport)
  }

  return { catalog, auditReport }
}
