/**
 * JSON 组件目录生成器
 *
 * 职责：
 * 1. 扫描 SPARK 组件源码；
 * 2. 通过 VCM 提取组件 Props / Emits / 元数据；
 * 3. 对高重复结构做共享池化；
 * 4. 产出 component-catalog.json 作为组件目录单一事实源。
 *
 * 设计原则：
 * - 运行时模型保留完整信息，便于审计与后续扩展；
 * - 落盘前再做瘦身，避免把内部辅助信息直接写入产物；
 * - 落盘结构只按真实 type 去重，复杂字段使用标准 JSON Schema `$ref` 引用其它 type。
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
import type { SkillMeta } from './utils'
import type {
  ComponentCatalog,
  ComponentEntry,
  PropEntry,
  EmitEntry,
  PropSchema,
  PropSchemaProperty,
  JsonSchemaTypeName,
  CatalogBindingDescriptor,
  PlatformConstraints,
} from './component-catalog-schema'
import { auditCatalog, logAuditReport } from './catalog-quality-audit'
import type { AuditReport, AuditOptions } from './catalog-quality-audit'

import { nestedSchemaCollector } from './nested-schema-collector'
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
  /** 自动提取的字符串字面量枚举 variants（已用引号包裹） */
  __enumVariants?: string[]
  /** 从 JSDoc @enumValue 标签提取的枚举值说明。 */
  __enumValueDocs?: Record<string, EnumValueDoc>
}

/** 共享 schema 构建上下文，key 固定为 TypeScript 类型名。 */
interface SchemaPoolContext {
  pool: Record<string, PropSchema>
}

interface EnumValueDoc {
  title?: string
  description?: string
}

type SchemaRelation = 'root' | 'property' | 'items' | 'prefixItem' | 'oneOf' | 'anyOf'

/**
 * 结构性属性不再保留在组件 props 列表里。
 *
 * 它们会通过治理契约表达，避免每个组件重复写出同样的低信息量字段。
 */
const STRUCTURAL_PROP_NAMES = new Set(['type', 'id', 'children'])

/**
 * 外部系统对象或 DOM/CSS 相关类型。
 *
 * 这些类型往往会展开成大量对业务无帮助的字段，因此不应进入 schema type 池。
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
 * 这里保存的是消费者需要共享遵循的平台规则，例如 DataViewKey正则、容器上下文映射、
 * 有效组件类型前缀等。它们属于目录的一部分，而不是临时构建细节。
 */
const DEFAULT_CONSTRAINTS: PlatformConstraints = {
  dataViewKeyPattern: {
    value: String.raw`^(#[\w-]+@)?[\w-]+@[\w-]+$`,
    description: 'DataViewKey format constraint; 用于定位 DataView。成员读取请使用 dataMember 和 dataField。',
    examples: ['orders@default', 'orders@grid', '#main@orders@grid'],
  },
  validTypePrefixes: {
    value: ['r-', 'spark-'],
    description: 'Configurable component type prefixes; LLM 生成 SparkNode.type 时应优先使用这些前缀，避免编造未注册组件。',
    examples: ['r-table', 'r-text', 'spark-component-renderer'],
  },
  validAggregateTypes: {
    value: ['sum', 'count', 'avg', 'min', 'max', 'join'],
    description: 'Supported aggregate operators; 用于 DataView aggregates 配置和 aggregateResult 字段解释。',
    examples: ['sum', 'count', 'join'],
  },
  nonFieldRTypes: {
    value: ['r-table', 'r-form', 'r-detail', 'r-tree', 'r-list'],
    description: 'Container r-types that are not field controls; 这些组件提供数据/布局上下文，不应当作字段输入控件使用。',
    examples: ['r-table', 'r-form'],
  },
  containerContextMap: {
    value: {
      'r-table': 'table',
      'r-form': 'form',
      'r-detail': 'detail',
      'r-tree': 'tree',
      'r-list': 'list',
    },
    description: 'Container type to binding context mapping; 用于判断子组件读取 rows/currentRow/selectedRows 时处在哪种容器语境。',
    examples: [
      { type: 'r-table', context: 'table' },
      { type: 'r-form', context: 'form' },
    ],
  },
  nestingRules: {
    value: {},
    description: 'Container child nesting rules; key 为父组件 type，value 描述允许或禁止的子组件模式。空对象表示当前未声明额外嵌套限制。',
    examples: [
      {
        parentType: 'r-toolbar',
        rule: {
          allowedChildren: ['r-button', 'r-link'],
          note: 'Toolbar usually contains action controls.',
        },
      },
    ],
  },
}

// ── 4. 键池与上下文工厂 (Context Factories) ───────────────────────────────────────

/** 创建共享 schema 构建上下文。 */
function createSchemaPoolContext(): SchemaPoolContext {
  return {
    pool: {},
  }
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

  if (names.has('dataMember') || names.has('dataViewKey')) {
    descriptor.selfResolving = true
  }
  if (names.has('dataViewKey') && names.has('dataSource')) {
    descriptor.dataContainer = true
  }
  if (names.has('field')) descriptor.fieldProvider = true
  if (names.has('options') || names.has('optionDataViewKey')) descriptor.hasOptions = true

  const modelValue = props.find((prop) => prop.name === 'modelValue')
  if (modelValue?.type.includes('boolean') === true) descriptor.valueType = 'boolean'
  else if (modelValue?.type.includes('[]') === true || modelValue?.type.includes('Array') === true) descriptor.valueType = 'array'
  else if (modelValue !== undefined) descriptor.valueType = 'string'

  if (names.has('field')) descriptor.bindingDelegate = 'form-element'
  if (names.has('dataViewKey') && names.has('children')) descriptor.bindingDelegate = 'table'

  return Object.keys(descriptor).length > 0 ? descriptor : undefined
}

function createBindingDescriptorDescription(type: string, binding: CatalogBindingDescriptor): string {
  const parts: string[] = []
  if (binding.selfResolving === true) {
    parts.push(binding.dataContainer === true
      ? 'self-resolving binding，会从页面数据空间解析容器级 dataViewKey'
      : 'self-resolving binding，会从页面数据空间解析 DataView 输出成员')
  }
  if (binding.dataContainer === true) parts.push('data container，会向子组件提供 DataSource 上下文')
  if (binding.fieldProvider === true) parts.push('field provider，通过 field 读取或写入当前行字段')
  if (binding.hasOptions === true) parts.push('options provider，支持 options/optionDataViewKey 候选项来源')
  if (binding.bindingDelegate !== undefined) parts.push(`binding delegate 为 ${binding.bindingDelegate}`)
  if (binding.valueType !== undefined) parts.push(`受控值类型为 ${binding.valueType}`)
  if (binding.actionComponent === true) parts.push('action component，会参与动作权限控制')
  if (binding.columnLike === true) parts.push('column-like component，可按权限隐藏整列')

  return `${type} binding descriptor; ${parts.join('；')}。`
}

function createBindingDescriptorExamples(type: string, binding: CatalogBindingDescriptor): unknown[] {
  const examples: unknown[] = []
  if (binding.dataContainer === true) {
    examples.push({ type, props: { dataViewKey: 'orders@default' } })
  }
  else if (binding.selfResolving === true) {
    examples.push({ type, props: { dataViewKey: 'orders@default', dataMember: 'rows' } })
  }
  if (binding.fieldProvider === true) {
    examples.push({ type, props: { field: 'name' } })
  }
  if (binding.hasOptions === true) {
    examples.push({
      type,
      props: {
        field: 'status',
        options: [
          { label: '启用', value: 'enabled' },
          { label: '停用', value: 'disabled' },
        ],
      },
    })
  }
  if (binding.valueType === 'boolean') examples.push({ type, props: { value: false } })
  if (binding.valueType === 'array') examples.push({ type, props: { value: ['option-a'] } })
  if (binding.valueType === 'string') examples.push({ type, props: { value: 'text' } })
  return uniqueExamples(examples).slice(0, 3)
}

function annotateBindingDescriptor(type: string, binding: CatalogBindingDescriptor): CatalogBindingDescriptor {
  const examples = binding.examples ?? createBindingDescriptorExamples(type, binding)
  return {
    ...binding,
    description: binding.description ?? createBindingDescriptorDescription(type, binding),
    ...(examples.length > 0 ? { examples } : {}),
  }
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

function splitTopLevel(text: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  for (const char of text) {
    if (char === '<' || char === '(' || char === '[' || char === '{') depth++
    else if (char === '>' || char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)
    if (char === delimiter && depth === 0) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim().length > 0) result.push(current.trim())
  return result
}

function normalizeCatalogTypeText(typeText: string): string {
  const trimmed = typeText.trim()
  if (trimmed.length === 0) return trimmed

  let normalized = trimmed
  let previous: string
  do {
    previous = normalized
    normalized = normalized
      .replace(/\s*\|\s*undefined\b/gu, '')
      .replace(/\bundefined\s*\|\s*/gu, '')
      .trim()
  } while (normalized !== previous && normalized.length > 0)

  const parts = splitTopLevel(normalized, '|')
  if (parts.length <= 1) return normalized.length > 0 ? normalized : trimmed

  const filteredParts = parts.filter((part) => part.trim() !== 'undefined')
  if (filteredParts.length === 0) return trimmed
  if (filteredParts.length === parts.length) return normalized
  return filteredParts.join(' | ')
}

function normalizeTupleTypeText(typeText: string): string {
  const trimmed = normalizeCatalogTypeText(typeText)
  const tupleMatch = /^\[(.*)\]$/u.exec(trimmed)
  if (tupleMatch?.[1] === undefined) return trimmed

  const normalizedItems = splitTopLevel(tupleMatch[1], ',').map((item) => {
    const paramMatch = /^((?:\.\.\.)?[A-Za-z_$][\w$]*\??\s*:\s*)(.+)$/u.exec(item.trim())
    if (paramMatch?.[1] === undefined || paramMatch[2] === undefined) return item.trim()
    return `${paramMatch[1]}${normalizeCatalogTypeText(paramMatch[2])}`
  })
  return `[${normalizedItems.join(', ')}]`
}

function componentTypeToPascalName(type: string): string {
  return type
    .replace(/^r-/u, '')
    .split(/[-_]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')
}

function componentTypeToPropsInterfaceName(type: string): string | undefined {
  if (!type.startsWith('r-')) return undefined
  return `R${componentTypeToPascalName(type)}Props`
}

function legacyRendererPropsTypeNameToComponentType(typeName: string): string | undefined {
  const rendererPropsMatch = /^Renderer([A-Z][A-Za-z0-9]*)Props$/u.exec(typeName)
  if (rendererPropsMatch?.[1] === undefined) return undefined
  return `r-${toKebabCase(rendererPropsMatch[1])}`
}

function buildPropsInterfaceTypeIndex(registeredComponentTypes: ReadonlySet<string>): Map<string, string> {
  const index = new Map<string, string>()
  for (const componentType of [...registeredComponentTypes].sort((left, right) => left.localeCompare(right))) {
    const propsInterfaceName = componentTypeToPropsInterfaceName(componentType)
    if (propsInterfaceName === undefined) continue
    const existing = index.get(propsInterfaceName)
    if (existing !== undefined && existing !== componentType) {
      throw new Error(`component-catalog props interface 命名冲突: ${propsInterfaceName} -> ${existing}, ${componentType}`)
    }
    index.set(propsInterfaceName, componentType)
  }
  return index
}

function typeTextParts(typeText: string): string[] {
  const normalized = normalizeCatalogTypeText(typeText).trim()
  return [normalized, ...splitTopLevel(normalized, '|').map((part) => part.trim())]
    .filter((part) => part.length > 0)
}

function assertNoLegacyComponentPropsTypeName(
  typeName: string,
  registeredComponentTypes: ReadonlySet<string>,
): void {
  const legacyComponentType = legacyRendererPropsTypeNameToComponentType(typeName)
  if (legacyComponentType === undefined || !registeredComponentTypes.has(legacyComponentType)) return
  const canonicalName = componentTypeToPropsInterfaceName(legacyComponentType)
  throw new Error(
    `component-catalog props interface 命名不规范: ${typeName} 指向 ${legacyComponentType}，请改为 ${canonicalName ?? 'R{Component}Props'}`,
  )
}

function inferComponentTypeRef(
  prop: PropEntryWithMeta,
  registeredComponentTypes: ReadonlySet<string>,
  propsInterfaceTypeIndex: ReadonlyMap<string, string>,
): string | undefined {
  const candidates = [
    normalizeCatalogTypeText(prop.type),
    prop.__schemaIdentityKey,
    prop.schema?.title,
  ]

  for (const candidate of candidates) {
    if (candidate === undefined) continue
    for (const part of typeTextParts(candidate)) {
      if (registeredComponentTypes.has(part)) return part
      assertNoLegacyComponentPropsTypeName(part, registeredComponentTypes)
      const componentType = propsInterfaceTypeIndex.get(part)
      if (componentType !== undefined) return componentType
    }
  }
  return undefined
}

/** 判断属性描述是否只是 MDN 引用噪音。 */
function isMdnPropertyDescription(text?: string): boolean {
  return typeof text === 'string' && text.includes('MDN Reference')
}

/** 读取可作为 schema 根节点 id 的 TypeScript 类型名。 */
function getSchemaRefKey(schema: PropSchema): string {
  return (schema.title ?? '').trim()
}

function isObjectSchema(schema: PropSchema): schema is PropSchema & {
  type: 'object'
  properties: Record<string, PropSchemaProperty>
} {
  return schema.type === 'object' && schema.properties !== undefined
}

/**
 * 判断对象 schema 是否属于低信息量外部对象。
 *
 * 典型场景是 DOM Event/CSSProperties 这类系统类型，如果直接展开会污染 catalog。
 */
function isLowSignalObjectSchema(schema: PropSchema & {
  type: 'object'
  properties: Record<string, PropSchemaProperty>
}): boolean {
  const tsType = schema.title ?? ''
  if (LOW_SIGNAL_OBJECT_SCHEMA_TYPES.has(tsType)) return true

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
  if (isObjectSchema(schema) && isLowSignalObjectSchema(schema)) {
    return false
  }

  if (schema.enum?.length === 0) return false
  return true
}

function stripInternalSchemaFields(schema: PropSchema): PropSchema {
  const clean: PropSchema = { ...schema }
  delete (clean as PropSchemaProperty).__nestedSchema
  if (clean.properties !== undefined) {
    clean.properties = Object.fromEntries(
      Object.entries(clean.properties).map(([name, property]) => [name, stripInternalSchemaFields(property) as PropSchemaProperty]),
    )
  }
  if (clean.items !== undefined) clean.items = stripInternalSchemaFields(clean.items)
  if (clean.prefixItems !== undefined) clean.prefixItems = clean.prefixItems.map(stripInternalSchemaFields)
  if (clean.anyOf !== undefined) clean.anyOf = clean.anyOf.map(stripInternalSchemaFields)
  if (clean.oneOf !== undefined) clean.oneOf = clean.oneOf.map(stripInternalSchemaFields)
  return clean
}

function stripRootSchemaAnnotations(schema: PropSchema): PropSchema {
  const clean: PropSchema = { ...schema }
  delete clean.description
  delete clean.default
  delete clean.examples
  return clean
}

function stripInlineEnumNoise(schema: PropSchema): PropSchema {
  const clean = stripInternalSchemaFields(schema)
  delete clean.title
  delete clean.examples
  if (clean.oneOf !== undefined) {
    clean.oneOf = clean.oneOf.map((branch) => {
      const next = stripInternalSchemaFields(branch)
      delete next.examples
      return next
    })
  }
  return clean
}

function mergeRootSchemaAnnotations(existing: PropSchema, next: PropSchema): PropSchema {
  const examples = uniqueExamples([
    ...(existing.examples ?? []),
    ...(next.examples ?? []),
  ])
  return {
    ...existing,
    ...(existing.description === undefined && next.description !== undefined ? { description: next.description } : {}),
    ...(existing.default === undefined && next.default !== undefined ? { default: next.default } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  }
}

/**
 * 为 schema 获取稳定 ref。
 *
 * Catalog 直接用 TypeScript 类型名作为 schema 根节点 id，避免 `schema_00001`
 * 这类无语义编号泄漏到消费面。相同 type 必须对应完全一致的 schema。
 */
function resolveSchemaRef(
  context: SchemaPoolContext,
  schema: PropSchema,
  identityKey?: string,
): string {
  const normalizedIdentityKey = identityKey?.trim()
  const schemaRefKey = getSchemaRefKey(schema)
  const ref = schemaRefKey.length > 0 ? schemaRefKey : (normalizedIdentityKey ?? '')
  if (ref.length === 0) {
    throw new Error('component-catalog schema title/identityKey 为空，无法建立 schema type 引用')
  }

  const pooledSchema = stripInternalSchemaFields({ ...schema, title: schema.title ?? ref })
  const schemaKey = `schema:${stableStringify(stripRootSchemaAnnotations(pooledSchema))}`
  const existing = context.pool[ref]
  if (existing !== undefined) {
    const existingKey = `schema:${stableStringify(stripRootSchemaAnnotations(existing))}`
    if (existingKey !== schemaKey) {
      throw new Error(`component-catalog schema type 冲突: ${ref}`)
    }
    context.pool[ref] = mergeRootSchemaAnnotations(existing, pooledSchema)
    return ref
  }

  context.pool[ref] = pooledSchema
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
  if (isEnumLikeSchema(normalizedNestedSchema)) {
    const inlineEnum = stripInlineEnumNoise(normalizedNestedSchema)
    const description = normalizedProperty.description ?? inlineEnum.description
    const defaultValue = normalizedProperty.default ?? inlineEnum.default
    delete normalizedProperty.__nestedSchema
    return {
      ...normalizedProperty,
      ...inlineEnum,
      ...(description !== undefined ? { description } : {}),
      ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    }
  }
  const ref = resolveSchemaRef(
    context,
    normalizedNestedSchema,
    property.title !== undefined && property.title.length > 0 ? property.title : fallbackIdentityKey,
  )
  normalizedProperty.$ref = ref
  delete normalizedProperty.__nestedSchema
  return normalizedProperty
}

function normalizeNestedSchema(context: SchemaPoolContext, schema: PropSchema): PropSchema {
  if (!isObjectSchema(schema)) {
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

function normalizeInlineSchema(context: SchemaPoolContext, schema: PropSchema): PropSchema {
  if (schema.type !== 'array') return stripInternalSchemaFields(schema)

  const normalized: PropSchema = {
    ...schema,
    type: 'array',
  }
  delete normalized.title

  if (schema.items !== undefined) {
    const itemSchema = normalizeNestedSchema(context, schema.items)
    if (isObjectSchema(itemSchema) && shouldRetainSchema(itemSchema)) {
      normalized.items = { $ref: resolveSchemaRef(context, itemSchema, itemSchema.title) }
    } else {
      normalized.items = stripInternalSchemaFields(itemSchema)
    }
  }

  if (schema.prefixItems !== undefined) {
    normalized.prefixItems = schema.prefixItems.map((item) => normalizeInlineSchema(context, item))
  }

  return stripInternalSchemaFields(normalized)
}

function applyEnumValueDocs(schema: PropSchema, enumValueDocs: Record<string, EnumValueDoc> | undefined): PropSchema {
  if (schema.enum === undefined || enumValueDocs === undefined || Object.keys(enumValueDocs).length === 0) {
    return schema
  }

  const oneOf = schema.enum.map((value): PropSchema => {
    if (typeof value !== 'string') return { const: value }
    const doc = enumValueDocs[value]
    if (doc === undefined) return { const: value, title: value }

    return {
      const: value,
      ...(doc.title !== undefined ? { title: doc.title } : { title: value }),
      ...(doc.description !== undefined ? { description: doc.description } : {}),
    }
  })

  const hasDocumentedBranch = oneOf.some((branch) => branch.description !== undefined)
  return hasDocumentedBranch ? { ...schema, oneOf } : schema
}

function createGenericPropDescription(name: string, type: string): string {
  if (name === 'modelValue') return 'Bound model value; 由 v-model 同步的当前值。'
  if (name === 'value') return 'Display or input value; 用于展示或绑定当前字段值。'
  if (name === 'field') return 'Data field key; 绑定 rows/currentRow 中的字段名。'
  if (name === 'dataViewKey') return 'DataViewKey; 指向页面数据上下文中的 DataView，格式为 table@viewId。'
  if (name === 'dataMember') return 'DataMember; DataView 成员枚举，例如 rows/currentRow/aggregateResult。'
  if (name === 'dataField') return 'DataField; DataView 成员内部业务字段或点路径。'
  if (name === 'children') return 'Child SparkNode list; 用于声明嵌套组件。'
  if (name === 'options') return 'Option list; 用于 select/radio 等选项型组件。'
  if (name === 'disabled') return 'Disabled state; true 时禁止用户交互。'
  if (name === 'loading') return 'Loading state; true 时展示加载反馈。'
  if (name === 'placeholder') return 'Placeholder text; 在用户输入前显示提示。'
  if (name === 'title') return 'Title text; 用于面板、容器或提示区域标题。'
  return `${name} prop (${type}); 用于配置该组件的 ${name} 行为或展示。`
}

function parseJsonSafeDefault(defaultText: string | undefined): unknown {
  if (defaultText === undefined) return undefined
  const trimmed = defaultText.trim()
  if (trimmed.length === 0 || trimmed === 'undefined' || trimmed === 'void 0') return undefined
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed)

  const quoted = /^(['"`])([\s\S]*)\1$/u.exec(trimmed)
  if (quoted?.[1] !== '`' && quoted?.[2] !== undefined) return quoted[2]

  const factoryMatch = /^\(\)\s*=>\s*(.+)$/u.exec(trimmed)
  const jsonCandidate = factoryMatch?.[1]?.trim() ?? trimmed
  const unwrappedObject = /^\((\{[\s\S]*\})\)$/u.exec(jsonCandidate)?.[1] ?? jsonCandidate
  try {
    return JSON.parse(unwrappedObject)
  } catch {
    return undefined
  }
}

function examplesFromTypeText(typeText: string): unknown[] {
  const compactType = typeText.replace(/\s+/g, '')
  if (/\bCascaderValue\b/u.test(typeText)) return [['province', 'city']]
  if (/\bCheckboxGroupMultiValue\b/u.test(typeText)) return [['option-a', 'option-b']]
  if (/\bMultiValue\b/u.test(typeText)) return [['option-a', 'option-b']]
  if (/\bTransferValue\b/u.test(typeText)) return [['item-1', 'item-2']]
  if (/\bSparkNode\b/u.test(typeText)) return [{ type: 'r-text', props: { value: 'text' } }]
  if (/\bICapabilityContext\b/u.test(typeText)) return []
  if (compactType === 'unknown') return []

  const normalized = typeText.toLowerCase()
  if (normalized.includes('=>') || normalized.includes('function') || normalized.includes('promise<')) return []
  if (normalized.includes('[]') || normalized.includes('array<') || normalized.includes('readonlyarray<')) return [[]]
  if (normalized.includes('record<') || normalized.includes('object') || normalized.includes('{')) return [{}]
  return []
}

function examplesFromSchemaShape(schema: PropSchema | undefined): unknown[] {
  if (schema === undefined) return []
  if (schema.enum !== undefined && schema.enum.length > 0) return []

  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schemaType === 'array') return [[]]
  if (schemaType === 'object' && (schema.required?.length ?? 0) === 0) return [{}]
  return []
}

function createExamplesForName(name: string): unknown[] {
  if (name === 'children') return [[{ type: 'r-text', props: { value: 'text' } }]]
  if (name === 'toolbar') return [{ children: [] }]
  if (name === 'actions') return [{ children: [] }]
  if (name === 'filter') return [{ children: [] }]
  if (name === 'editor') return [{ children: [] }]
  if (name === 'header') return [{ children: [] }]
  if (name === 'footer') return [{ children: [] }]
  if (name === 'tail') return [{ children: [] }]
  if (name === 'policy') return [{ rootLabel: '$' }]
  if (name === 'range') return [['2026-01-01', '2026-01-31']]
  if (name === 'turnConcurrency') return [{ maxParallelTurns: 1, overflow: 'queue' }]
  if (name === 'fcLoop') return [{ enabled: true, maxRounds: 3 }]
  if (name === '_modelPerm') return [{ allowCreate: true, allowExport: true }]
  if (name === 'aggregateResult') return [{ totalAmount: 1234, count: 2 }]
  if (name === 'selectionAggregateResult') return [{ totalAmount: 1234 }]
  if (name === 'currentRow') return [null]
  return []
}

function uniqueExamples(values: unknown[]): unknown[] {
  const seen = new Set<string>()
  const result: unknown[] = []
  for (const value of values) {
    const key = stableStringify(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function schemaPrimaryType(schema: PropSchema | undefined): JsonSchemaTypeName | undefined {
  if (schema === undefined) return undefined
  return Array.isArray(schema.type) ? schema.type[0] : schema.type
}

function isEnumLikeSchema(schema: PropSchema | undefined): boolean {
  if (schema === undefined) return false
  if (schema.enum !== undefined && schema.enum.length > 0) return true
  return schema.oneOf?.some(item => item.const !== undefined) === true
}

function shouldKeepExamplesForSchema(schema: PropSchema | undefined, typeText: string | undefined): boolean {
  if (schema?.$ref !== undefined) return false
  if (isEnumLikeSchema(schema)) return false

  const schemaType = schemaPrimaryType(schema)
  if (schemaType === 'array' || schemaType === 'object') return true

  const normalizedType = (typeText ?? '').toLowerCase()
  if (normalizedType.includes('=>') || normalizedType.includes('function') || normalizedType.includes('promise<')) return false
  if (normalizedType.includes('[]') || normalizedType.includes('array<') || normalizedType.includes('readonlyarray<')) return true
  if (normalizedType.includes('record<') || normalizedType.includes('object') || normalizedType.includes('{')) return true
  if (/\b(cascadervalue|checkboxgroupmultivalue|multivalue|transfervalue|sparknode|icapabilitycontext)\b/u.test(normalizedType)) {
    return true
  }
  return false
}

function createPropExamples(
  name: string,
  type: string,
  schema: PropSchema | undefined,
  defaultValue: unknown,
  sourceExamples: unknown[] = [],
): unknown[] {
  void defaultValue
  if (!shouldKeepExamplesForSchema(schema, type)) return []
  return uniqueExamples([
    ...sourceExamples,
    ...createExamplesForName(name),
    ...(schema?.examples ?? []),
    ...examplesFromSchemaShape(schema),
    ...examplesFromTypeText(type),
  ]).slice(0, 3)
}

function createGenericSchemaExamples(schema: PropSchema, relation: SchemaRelation, options: { name?: string; index?: number }): unknown[] {
  if (!shouldKeepExamplesForSchema(schema, schema.title)) return []
  if (options.name !== undefined) {
    const namedExamples = createExamplesForName(options.name)
    if (namedExamples.length > 0) return namedExamples
  }
  if (schema.title !== undefined) {
    const titleExamples = examplesFromTypeText(schema.title)
    if (titleExamples.length > 0) return titleExamples
  }
  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schemaType === 'array') return [[]]
  if (schemaType === 'object') return [{}]
  void relation
  return []
}

function annotateSchemaExamples(
  schema: PropSchema,
  name: string,
  type: string,
  defaultValue: unknown,
): PropSchema {
  const examples = createPropExamples(name, type, schema, defaultValue, schema.examples)
  return {
    ...schema,
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  }
}

function categoryLabel(category: ComponentEntry['category']): string {
  if (category === 'container') return '容器组件'
  if (category === 'field') return '字段组件'
  if (category === 'group') return '分组/布局组件'
  if (category === 'meta') return '元组件'
  return '功能组件'
}

function bindingDescription(binding: CatalogBindingDescriptor | undefined): string | undefined {
  if (binding === undefined) return undefined
  const parts: string[] = []
  if (binding.selfResolving === true) {
    parts.push(binding.dataContainer === true ? 'self-resolving dataViewKey' : 'self-resolving DataView member')
  }
  if (binding.dataContainer === true) parts.push('向子组件提供数据上下文')
  if (binding.fieldProvider === true) parts.push('通过 field 绑定行字段')
  if (binding.hasOptions === true) parts.push('支持 options/optionDataViewKey 选项数据')
  if (binding.bindingDelegate !== undefined) parts.push(`bindingDelegate=${binding.bindingDelegate}`)
  if (binding.valueType !== undefined) parts.push(`valueType=${binding.valueType}`)
  return parts.length > 0 ? `绑定语义：${parts.join('，')}。` : undefined
}

const COMPONENT_KEY_PROP_ORDER = [
  'dataViewKey',
  'dataMember',
  'dataField',
  'field',
  'value',
  'modelValue',
  'columns',
  'toolbar',
  'filter',
  'actions',
  'items',
  'options',
  'optionDataViewKey',
  'action',
  'label',
  'title',
  'placeholder',
]

function selectKeyProps(props: PropEntry[]): string[] {
  const byName = new Map(props.map((prop) => [prop.name, prop]))
  const ordered = [
    ...props.filter((prop) => prop.required).map((prop) => prop.name),
    ...COMPONENT_KEY_PROP_ORDER.filter((name) => byName.has(name)),
  ]
  return [...new Set(ordered)].slice(0, 6)
}

function buildComponentDescription(options: {
  type: string
  baseDescription: string
  category: ComponentEntry['category']
  props: PropEntry[]
  emits: EmitEntry[]
  binding?: CatalogBindingDescriptor
  internal?: boolean
  configurable?: boolean
}): string {
  const parts = [options.baseDescription.trim()]
  parts.push(`配置入口：type="${options.type}"，category=${options.category}（${categoryLabel(options.category)}）。`)
  if (options.internal === true || options.configurable === false) {
    parts.push('配置状态：internal/non-configurable，仅供技术目录和运行时引用，不应由 LLM 生成到页面配置。')
  }

  const bindingText = bindingDescription(options.binding)
  if (bindingText !== undefined) parts.push(bindingText)

  const requiredProps = options.props.filter((prop) => prop.required).map((prop) => prop.name).slice(0, 6)
  if (requiredProps.length > 0) parts.push(`必填 props：${requiredProps.join(', ')}。`)

  const keyProps = options.binding?.dataContainer === true
    ? selectKeyProps(options.props).filter(prop => prop !== 'dataMember' && prop !== 'dataField')
    : selectKeyProps(options.props)
  if (keyProps.length > 0) parts.push(`关键 props：${keyProps.join(', ')}。`)

  const eventNames = options.emits.map((emit) => emit.name).slice(0, 5)
  if (eventNames.length > 0) parts.push(`主要事件：${eventNames.join(', ')}。`)

  return parts.join(' ')
}

// ── 6. 组件条目压缩与 schema 建模 (Compaction & Schema Model) ─────────────────────

/**
 * 紧凑化组件 props。
 *
 * 处理策略：
 * - 移除结构性 props；
 * - 保留基础展示字段；
 * - 复杂 schema 提升为 schema type 引用，落盘时转成 JSON Schema `$ref`；
 * - 若存在组件引用，则转成标准 JSON Schema `$ref`。
 */
function compactProps(
  rawProps: PropEntryWithMeta[],
  schemaPool: SchemaPoolContext,
  registeredComponentTypes: ReadonlySet<string>,
  propsInterfaceTypeIndex: ReadonlyMap<string, string>,
): PropEntry[] {
  const result: PropEntry[] = []

  for (const prop of rawProps) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue
    const componentTypeRef = inferComponentTypeRef(prop, registeredComponentTypes, propsInterfaceTypeIndex)
    const type = componentTypeRef ?? normalizeCatalogTypeText(prop.type)
    const defaultValue = parseJsonSafeDefault(prop.default)

    const compacted: PropEntry = {
      name: prop.name,
      type,
      required: prop.required,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      description: prop.description ?? createGenericPropDescription(prop.name, type),
    }

    // 组件 props 类型（如 RToolbarProps / RHeaderProps）表示该字段的真相是组件 type；
    // 落盘时只暴露标准 JSON Schema `$ref`。
    if (componentTypeRef !== undefined) {
      compacted.schema = { $ref: componentTypeRef }
      result.push(compacted)
      continue
    }

    // 结构 schema 优先级：
    // 1) VCM 抽取出的真实结构（object/array）进入 `$defs` 或数组 items；
    // 2) 匿名字面量 enum 直接内联，避免把 `"a" | "b"` 伪装成共享业务 type；
    let schemaResolved = false
    if (prop.schema !== undefined) {
      const schemaWithExamples = annotateSchemaExamples(prop.schema, prop.name, type, defaultValue)
      const normalizedSchema = normalizeNestedSchema(schemaPool, schemaWithExamples)
      if (schemaWithExamples.type === 'array') {
        compacted.schema = normalizeInlineSchema(schemaPool, schemaWithExamples)
        schemaResolved = true
        result.push(compacted)
        continue
      }
      const isExternalObjectSchema = isObjectSchema(prop.schema) && prop.__schemaOwner === 'external'
      const documentedSchema = applyEnumValueDocs(normalizedSchema, prop.__enumValueDocs)
      if (isEnumLikeSchema(documentedSchema)) {
        compacted.schema = stripInlineEnumNoise(documentedSchema)
        schemaResolved = true
      } else if (!isExternalObjectSchema && shouldRetainSchema(normalizedSchema)) {
        const ref = resolveSchemaRef(
          schemaPool,
          documentedSchema,
          prop.__schemaIdentityKey,
        )
        compacted.schemaNodeId = ref
        schemaResolved = true
      }
    }
    if (!schemaResolved && prop.__enumVariants !== undefined && prop.__enumVariants.length > 0) {
      const enumType = normalizeCatalogTypeText(prop.type)
      const enumSchema: PropSchema = {
        title: enumType,
        type: 'string',
        enum: prop.__enumVariants
          .filter((variant) => /^".*"$/.test(variant) || /^'.*'$/.test(variant))
          .map((variant) => variant.slice(1, -1)),
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      }
      const documentedEnumSchema = applyEnumValueDocs(enumSchema, prop.__enumValueDocs)
      if (shouldRetainSchema(documentedEnumSchema)) {
        compacted.schema = stripInlineEnumNoise(documentedEnumSchema)
      }
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
    const type = emit.type !== undefined ? normalizeTupleTypeText(emit.type) : undefined
    const compacted: EmitEntry = {
      name: emit.name,
      ...(type !== undefined ? { type } : {}),
      ...(emit.description !== undefined ? { description: emit.description } : {}),
    }

    if (emit.__payloadSchemas !== undefined && emit.__payloadSchemas.length > 0) {
      const payloadSchemas: Array<{
        ref: string
        schema: PropSchema
        paramDoc?: NonNullable<EmitEntry['__payloadParamDocs']>[number]
      }> = []
      for (const [index, schema] of emit.__payloadSchemas.entries()) {
        const paramDoc = emit.__payloadParamDocs?.[index]
        const normalizedSchema = normalizeNestedSchema(schemaPool, schema)
        const describedSchema = normalizedSchema.description === undefined && paramDoc?.description !== undefined
          ? { ...normalizedSchema, description: paramDoc.description }
          : normalizedSchema
        if (!shouldRetainSchema(describedSchema)) continue
        payloadSchemas.push({
          ref: resolveSchemaRef(schemaPool, describedSchema),
          schema: describedSchema,
          ...(paramDoc !== undefined ? { paramDoc } : {}),
        })
      }
      if (payloadSchemas.length > 0) {
        const paramDocs = emit.__payloadParamDocs ?? []
        const eventSchema: PropSchema = {
          ...(type !== undefined ? { title: type } : {}),
          type: 'array',
          prefixItems: payloadSchemas.map(({ ref, schema, paramDoc: payloadParamDoc }, index) => {
            const paramDoc = payloadParamDoc ?? paramDocs[index]
            const paramName = paramDoc?.name ?? `payload${index + 1}`
            const paramExamples = createGenericSchemaExamples(schema, 'prefixItem', { name: paramName, index })
            return {
              $ref: ref,
              title: paramName,
              description: paramDoc?.description ?? `${paramName} payload; 用于 ${emit.name} 事件参数。`,
              ...(paramExamples.length > 0 ? { examples: paramExamples } : {}),
            }
          }),
          ...(emit.description !== undefined ? { description: emit.description } : {}),
        }
        compacted.schema = eventSchema
      }
    }

    result.push(compacted)
  }

  return result
}

interface CatalogRuntimeModel {
  version: ComponentCatalog['version']
  buildTime: string
  componentCount: number
  components: Record<string, ComponentEntry>
  schemaPool?: Record<string, PropSchema>
  constraints: PlatformConstraints
  bindingDescriptors: Record<string, CatalogBindingDescriptor>
}

interface ExtractedComponentRecord {
  type: string
  normalizedFilePath: string
  category: ComponentEntry['category']
  rawProps: PropEntryWithMeta[]
  rawEmits: EmitEntry[]
  skillMeta: SkillMeta | null
  explicitSkillMeta: SkillMeta | null
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right))) as Record<string, T>
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/gu, '~0').replace(/\//gu, '~1')
}

function toDefsRef(ref: string): string {
  const trimmed = ref.trim()
  if (trimmed.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(trimmed)) {
    return trimmed
  }
  return `#/$defs/${escapeJsonPointerSegment(trimmed)}`
}

function normalizePublicSchemaRefs(schema: PropSchema): PropSchema {
  const clean = stripInternalSchemaFields(schema)
  const normalized: PropSchema = { ...clean }

  if (normalized.$ref !== undefined) normalized.$ref = toDefsRef(normalized.$ref)
  if (normalized.properties !== undefined) {
    normalized.properties = Object.fromEntries(
      Object.entries(normalized.properties).map(([name, property]) => [
        name,
        normalizePublicSchemaRefs(property) as PropSchemaProperty,
      ]),
    )
  }
  if (normalized.items !== undefined) normalized.items = normalizePublicSchemaRefs(normalized.items)
  if (normalized.prefixItems !== undefined) normalized.prefixItems = normalized.prefixItems.map(normalizePublicSchemaRefs)
  if (normalized.anyOf !== undefined) normalized.anyOf = normalized.anyOf.map(normalizePublicSchemaRefs)
  if (normalized.oneOf !== undefined) normalized.oneOf = normalized.oneOf.map(normalizePublicSchemaRefs)
  if (normalized.examples !== undefined && !shouldKeepExamplesForSchema(normalized, normalized.title)) {
    delete normalized.examples
  }

  return normalized
}

function normalizePublicRootSchema(type: string, schema: PropSchema): PropSchema {
  void type
  const normalized = normalizePublicSchemaRefs(schema)
  return normalized
}

function schemaTypeFromRef(ref: string | undefined): string | undefined {
  if (ref === undefined) return undefined
  if (ref.startsWith('#/$defs/')) {
    return ref
      .slice('#/$defs/'.length)
      .replace(/~1/gu, '/')
      .replace(/~0/gu, '~')
  }
  if (ref.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(ref)) return undefined
  return ref
}

function inferSimpleSchemaFromType(typeText: string): PropSchema {
  const normalized = normalizeCatalogTypeText(typeText)
  const compact = normalized.replace(/\s+/gu, '').toLowerCase()
  const parts = splitTopLevel(normalized, '|')
  if (parts.length > 1) {
    const stringLiteralValues = parts.map((part) => /^["'](.*)["']$/u.exec(part.trim())?.[1])
    if (stringLiteralValues.every((value): value is string => value !== undefined)) {
      return { type: 'string', enum: stringLiteralValues }
    }

    const primitiveTypes = parts.map((part): JsonSchemaTypeName | undefined => {
      const item = part.trim().toLowerCase()
      if (item === 'string') return 'string'
      if (item === 'number') return 'number'
      if (item === 'boolean') return 'boolean'
      if (item === 'null') return 'null'
      return undefined
    })
    if (primitiveTypes.every((type): type is JsonSchemaTypeName => type !== undefined)) {
      const uniqueTypes = [...new Set(primitiveTypes)]
      if (uniqueTypes.length === 0) return {}
      const [firstType] = uniqueTypes
      if (firstType === undefined) return {}
      return { type: uniqueTypes.length === 1 ? firstType : uniqueTypes }
    }
  }

  if (compact === 'string') return { type: 'string' }
  if (compact === 'number') return { type: 'number' }
  if (compact === 'boolean') return { type: 'boolean' }
  if (compact === 'null') return { type: 'null' }
  if (compact.endsWith('[]') || compact.startsWith('array<') || compact.startsWith('readonlyarray<')) {
    return { type: 'array' }
  }
  if (compact.includes('record<') || compact === 'object' || normalized.trim().startsWith('{')) {
    return { type: 'object' }
  }
  return {}
}

function createComponentPropSchema(prop: PropEntry): PropSchemaProperty {
  const rawSchema = prop.schema ?? (prop.schemaNodeId === undefined ? undefined : { $ref: prop.schemaNodeId })
  const schema = rawSchema === undefined
    ? inferSimpleSchemaFromType(prop.type)
    : normalizePublicSchemaRefs(rawSchema)
  const defaultValue = prop.default === undefined ? undefined : parseJsonSafeDefault(prop.default)
  return {
    ...schema,
    ...(schema.description === undefined && prop.description !== undefined ? { description: prop.description } : {}),
    ...(schema.default === undefined && defaultValue !== undefined ? { default: defaultValue } : {}),
  } as PropSchemaProperty
}

function createComponentNodeSchema(entry: ComponentEntry): PropSchema {
  const propSchemas = Object.fromEntries(
    entry.props.map((prop) => [prop.name, createComponentPropSchema(prop)]),
  ) as Record<string, PropSchemaProperty>
  const requiredProps = entry.props.filter((prop) => prop.required).map((prop) => prop.name)
  const propsSchema: PropSchemaProperty = {
    type: 'object',
    description: `${entry.type} props 配置对象。`,
    ...(Object.keys(propSchemas).length > 0 ? { properties: propSchemas } : {}),
    ...(requiredProps.length > 0 ? { required: requiredProps } : {}),
  }

  return normalizePublicRootSchema(entry.type, {
    title: entry.type,
    type: 'object',
    description: entry.description,
    properties: {
      type: {
        type: 'string',
        const: entry.type,
        description: `SparkNode.type 固定为 ${entry.type}。`,
      },
      props: propsSchema,
      children: {
        type: 'array',
        description: '子节点列表；每一项都是 SparkNode。',
        items: { $ref: 'SparkNode' },
      },
    },
    required: ['type'],
  })
}

function collectComponentTypeRefs(components: Record<string, ComponentEntry>): Set<string> {
  const refs = new Set<string>()
  for (const entry of Object.values(components)) {
    for (const prop of entry.props) {
      const refType = schemaTypeFromRef(prop.schema?.$ref)
      if (refType === undefined) continue
      if (components[refType] === undefined) {
        throw new Error(`component-catalog 组件 schema 引用未注册: ${entry.type}.${prop.name} -> ${refType}`)
      }
      refs.add(refType)
    }
  }
  return refs
}

function buildComponentDefs(components: Record<string, ComponentEntry>): Record<string, PropSchema> | undefined {
  const refs = collectComponentTypeRefs(components)
  if (refs.size === 0) return undefined
  return sortRecord(
    Object.fromEntries([...refs].sort((left, right) => left.localeCompare(right)).map((type) => {
      const entry = components[type]
      if (entry === undefined) {
        throw new Error(`component-catalog 组件 schema 引用未注册: ${type}`)
      }
      return [type, createComponentNodeSchema(entry)]
    })) as Record<string, PropSchema>,
  )
}

function mergeDefs(...defsList: Array<Record<string, PropSchema> | undefined>): Record<string, PropSchema> | undefined {
  const merged: Record<string, PropSchema> = {}
  for (const defs of defsList) {
    if (defs === undefined) continue
    for (const [type, schema] of Object.entries(defs)) {
      const existing = merged[type]
      if (existing !== undefined && stableStringify(existing) !== stableStringify(schema)) {
        throw new Error(`component-catalog $defs type 冲突: ${type}`)
      }
      merged[type] = schema
    }
  }

  if (Object.keys(merged).length === 0) return undefined
  merged['SparkNode'] ??= {
      title: 'SparkNode',
      type: 'object',
      description: 'Spark h-function 节点：通过 type 选择组件，props 配置属性，children 描述子节点。',
      properties: {
        type: { type: 'string', description: '组件 type，例如 r-table 或 r-text。' },
        props: { type: 'object', description: '组件 props 配置对象。' },
        children: {
          type: 'array',
          description: '子节点列表。',
          items: { $ref: '#/$defs/SparkNode' },
        },
      },
      required: ['type'],
    }
  return sortRecord(merged)
}

function toPublicProp(prop: PropEntry): PropEntry {
  const schema = prop.schema ?? (prop.schemaNodeId === undefined ? undefined : { $ref: prop.schemaNodeId })
  const clean: PropEntry = {
    name: prop.name,
    type: prop.type,
    required: prop.required,
    ...(prop.default !== undefined ? { default: prop.default } : {}),
    ...(prop.description !== undefined ? { description: prop.description } : {}),
    ...(prop.examples !== undefined ? { examples: prop.examples } : {}),
    ...(schema !== undefined ? { schema: normalizePublicSchemaRefs(schema) } : {}),
  }
  return clean
}

function toPublicEmit(emit: EmitEntry): EmitEntry {
  const schema = emit.schema ?? (emit.schemaNodeId === undefined ? undefined : { $ref: emit.schemaNodeId })
  return {
    name: emit.name,
    ...(emit.type !== undefined ? { type: emit.type } : {}),
    ...(emit.description !== undefined ? { description: emit.description } : {}),
    ...(schema !== undefined ? { schema: normalizePublicSchemaRefs(schema) } : {}),
  }
}

function toPublicComponent(entry: ComponentEntry): ComponentEntry {
  return {
    type: entry.type,
    ...(entry.filePath !== undefined ? { filePath: entry.filePath } : {}),
    category: entry.category,
    description: entry.description,
    ...(entry.internal !== undefined ? { internal: entry.internal } : {}),
    ...(entry.configurable !== undefined ? { configurable: entry.configurable } : {}),
    props: entry.props.map(toPublicProp),
    emits: entry.emits.map(toPublicEmit),
    ...(entry.contracts !== undefined ? { contracts: entry.contracts } : {}),
    ...(entry.rootFields !== undefined ? { rootFields: entry.rootFields } : {}),
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
    ...(entry.provides !== undefined ? { provides: entry.provides } : {}),
    ...(entry.consumes !== undefined ? { consumes: entry.consumes } : {}),
    ...(entry.propsInterface !== undefined ? { propsInterface: entry.propsInterface } : {}),
    source: entry.source,
  }
}

function buildComponentCatalog(model: CatalogRuntimeModel): ComponentCatalog {
  const components = Object.fromEntries(
    Object.entries(model.components)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, entry]) => [type, toPublicComponent(entry)]),
  ) as Record<string, ComponentEntry>
  const schemaDefs = model.schemaPool === undefined
    ? undefined
    : sortRecord(
      Object.fromEntries(
        Object.entries(model.schemaPool).map(([type, schema]) => [type, normalizePublicRootSchema(type, schema)]),
      ) as Record<string, PropSchema>,
    )
  const componentDefs = buildComponentDefs(model.components)
  const defs = mergeDefs(schemaDefs, componentDefs)

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    version: model.version,
    buildTime: model.buildTime,
    componentCount: model.componentCount,
    components,
    ...(defs !== undefined ? { $defs: defs } : {}),
  }
}

function collectSchemaRefs(schema: PropSchema | undefined, refs: Set<string>): void {
  if (schema === undefined) return
  if (schema.$ref !== undefined) refs.add(schema.$ref)
  if (schema.properties !== undefined) {
    for (const property of Object.values(schema.properties)) collectSchemaRefs(property, refs)
  }
  collectSchemaRefs(schema.items, refs)
  for (const item of schema.prefixItems ?? []) collectSchemaRefs(item, refs)
  for (const item of schema.anyOf ?? []) collectSchemaRefs(item, refs)
  for (const item of schema.oneOf ?? []) collectSchemaRefs(item, refs)
}

function pruneReachableSchemas(
  components: Record<string, ComponentEntry>,
  schemas: Record<string, PropSchema>,
): Record<string, PropSchema> | undefined {
  const reachable = new Set<string>()

  const visit = (ref: string | undefined): void => {
    if (ref === undefined || reachable.has(ref)) return
    const schema = schemas[ref]
    if (schema === undefined) return
    reachable.add(ref)

    const nestedRefs = new Set<string>()
    collectSchemaRefs(schema, nestedRefs)
    for (const nestedRef of nestedRefs) visit(nestedRef)
  }

  for (const entry of Object.values(components)) {
    for (const prop of entry.props) {
      visit(prop.schemaNodeId)
      const nestedRefs = new Set<string>()
      collectSchemaRefs(prop.schema, nestedRefs)
      for (const nestedRef of nestedRefs) visit(nestedRef)
    }
    for (const emit of entry.emits) {
      visit(emit.schemaNodeId)
      const nestedRefs = new Set<string>()
      collectSchemaRefs(emit.schema, nestedRefs)
      for (const nestedRef of nestedRefs) visit(nestedRef)
    }
  }

  if (reachable.size === 0) return undefined

  return Object.fromEntries(
    [...reachable]
      .sort((left, right) => left.localeCompare(right))
      .map((ref) => [ref, schemas[ref]]),
  ) as Record<string, PropSchema>
}

// ── 7. 组件扫描与目录构建 (Scanner & Builder) ─────────────────────────────────────

/**
 * 扫描输入文件并构建完整目录模型。
 *
 * 该阶段负责：
 * - 建立 TS / Vue 检查器；
 * - 提取每个组件的 VCM API；
 * - 生成组件条目、bindingDescriptors、schema type 池；
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
  const bindingDescriptors: Record<string, CatalogBindingDescriptor> = {}
  const schemaPool = createSchemaPoolContext()

  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b))
  const extractedComponents: ExtractedComponentRecord[] = []

  for (const file of sortedFiles) {
    const abs = resolve(root, file)
    const type = inferSkillType(abs, toKebabCase(basename(file, '.vue')))
    if (type === null) continue
    const skillMeta = parseSkillMeta(abs, type)
    if (skillMeta?.catalogIgnore === true) continue
    const explicitSkillMeta = parseSkillMeta(abs, type, { requireSkillTag: true })

    // 通过 VCM 抽取组件 API 明细；抽取失败说明该文件不属于可索引组件。
    const vcmApi = extractComponentApiVcm(checker, abs, file, type, { includeGlobalProps })
    if (vcmApi === null) continue

    const rawProps = vcmApi.props as PropEntryWithMeta[]
    const normalizedFilePath = normalizePath(vcmApi.filePath)
    const category = inferCategory(normalizedFilePath, skillMeta?.category)

    extractedComponents.push({
      type,
      normalizedFilePath,
      category,
      rawProps,
      rawEmits: vcmApi.emits,
      skillMeta,
      explicitSkillMeta,
    })
  }

  const actualComponentTypes = new Set(extractedComponents.map((record) => record.type))
  const propsInterfaceTypeIndex = buildPropsInterfaceTypeIndex(actualComponentTypes)

  for (const record of extractedComponents) {
    const {
      type,
      normalizedFilePath,
      category,
      rawProps,
      rawEmits,
      skillMeta,
      explicitSkillMeta,
    } = record

    const props = compactProps(rawProps, schemaPool, actualComponentTypes, propsInterfaceTypeIndex)
    const emits = compactEmits(rawEmits, schemaPool)
    const inferredBinding = inferBinding(props)
    const binding = inferredBinding !== undefined ? annotateBindingDescriptor(type, inferredBinding) : undefined
    const description = buildComponentDescription({
      type,
      baseDescription: skillMeta?.description ?? `SPARK 组件：${type}`,
      category,
      props,
      emits,
      ...(binding !== undefined ? { binding } : {}),
      ...(skillMeta?.internal === true ? { internal: true } : {}),
      ...(skillMeta?.configurable !== undefined ? { configurable: skillMeta.configurable } : {}),
    })
    const entry: ComponentEntry = {
      type,
      filePath: normalizedFilePath,
      category,
      description,
      ...(skillMeta?.internal === true ? { internal: true, configurable: false } : {}),
      ...(skillMeta?.internal !== true && skillMeta?.configurable !== undefined ? { configurable: skillMeta.configurable } : {}),
      props,
      emits,
      source: explicitSkillMeta === null ? 'vcm' : 'vcm+meta',
      ...(binding !== undefined ? { binding } : {}),
    }

    components[type] = entry

    if (binding !== undefined) bindingDescriptors[type] = binding
  }

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
    bindingDescriptors,
    schemaPool: schemaPool.pool,
  }
}

// ── 8. 顶层生成入口 (Public Entry) ─────────────────────────────────────────────────

/**
 * 生成组件 JSON 目录并按需执行质量审计。
 *
 * 顶层流程：
 * 1. 按模式扫描目标 Vue 文件；
 * 2. 构建组件目录运行态模型；
 * 3. 补齐 constraints 等顶层信息；
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
    bindingDescriptors,
    schemaPool,
  } = buildSortedComponents(root, files, includeGlobalProps, tsconfigPath, vcmCheckerOptions)
  const reachableSchemaPool = pruneReachableSchemas(components, schemaPool)

  const runtimeCatalog: CatalogRuntimeModel = {
    version: '3.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(components).length,
    components,
    ...(reachableSchemaPool !== undefined ? { schemaPool: reachableSchemaPool } : {}),
    constraints: DEFAULT_CONSTRAINTS,
    bindingDescriptors,
  }
  const catalog = buildComponentCatalog(runtimeCatalog)

  const outPath = getCanonicalCatalogOutputPath(root)
  writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf-8')
  logger.info(`📦 ${catalog.componentCount} 组件已写入`)

  // 质量审计属于后置能力：目录本身先生成，再决定是否做结构质量分析。
  let auditReport: AuditReport | undefined
  if (audit !== undefined && audit !== false) {
    const auditOptions = typeof audit === 'object' ? audit : {}
    auditReport = auditCatalog(runtimeCatalog, auditOptions)
    logAuditReport(auditReport)
  }

  return { catalog, auditReport }
}
