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
 * - 通过 schemaNodes 自引用表与组件自包含条目，为 AI、工具链和后端递归查询提供稳定消费面。
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
  PropEntry,
  EmitEntry,
  PropSchema,
  PropSchemaProperty,
  SchemaNodeEntry,
  CatalogBindingDescriptor,
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
const _LOW_SIGNAL_ENUM_VARIANTS = new Set([
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
 * 这些类型往往会展开成大量对业务无帮助的字段，因此不应进入 schemaNodes。
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
  dataKeyPattern: {
    value: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|aggregateResult|selectionAggregateResult)(\.[\w.]+)?$`,
    description: 'DataKey format constraint; 用于把组件绑定到页面数据空间。格式支持 table@rows、table@currentRow.field、#scope@table@selectedRows 等。',
    examples: ['orders@rows', 'orders@currentRow.name', '#main@orders@selectedRows', 'orders@aggregateResult.totalAmount'],
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

function createBindingDescriptorDescription(type: string, binding: CatalogBindingDescriptor): string {
  const parts: string[] = []
  if (binding.selfResolving === true) parts.push('self-resolving dataKey，会从页面数据空间解析 dataKey')
  if (binding.dataContainer === true) parts.push('data container，会向子组件提供 DataSource 上下文')
  if (binding.fieldProvider === true) parts.push('field provider，通过 field 读取或写入当前行字段')
  if (binding.hasOptions === true) parts.push('options provider，支持 options/optionKey 候选项来源')
  if (binding.bindingDelegate !== undefined) parts.push(`binding delegate 为 ${binding.bindingDelegate}`)
  if (binding.valueType !== undefined) parts.push(`受控值类型为 ${binding.valueType}`)
  if (binding.actionComponent === true) parts.push('action component，会参与动作权限控制')
  if (binding.columnLike === true) parts.push('column-like component，可按权限隐藏整列')

  return `${type} binding descriptor; ${parts.join('；')}。`
}

function createBindingDescriptorExamples(type: string, binding: CatalogBindingDescriptor): unknown[] {
  const examples: unknown[] = []
  if (binding.selfResolving === true || binding.dataContainer === true) {
    examples.push({ type, props: { dataKey: 'orders@rows' } })
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
    throw new Error('component-catalog schema title/identityKey 为空，无法建立 schemaNodeId')
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
  if (name === 'dataKey') return 'DataView key; 指向页面数据上下文中的 rows/currentRow/selectedRows。'
  if (name === 'children') return 'Child SparkNode list; 用于声明嵌套组件。'
  if (name === 'options') return 'Option list; 用于 select/radio 等选项型组件。'
  if (name === 'disabled') return 'Disabled state; true 时禁止用户交互。'
  if (name === 'loading') return 'Loading state; true 时展示加载反馈。'
  if (name === 'placeholder') return 'Placeholder text; 在用户输入前显示提示。'
  if (name === 'title') return 'Title text; 用于面板、容器或提示区域标题。'
  return `${name} prop (${type}); 用于配置该组件的 ${name} 行为或展示。`
}

function describeSchemaType(schema: PropSchema): string {
  if (schema.enum !== undefined) return `enum(${schema.enum.map(String).join(' / ')})`
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  return schema.type ?? schema.title ?? 'value'
}

function createGenericSchemaDescription(
  schema: PropSchema,
  relation: SchemaNodeEntry['relation'],
  options: { name?: string; index?: number; required?: boolean },
): string {
  if (relation === 'root') {
    if (schema.enum !== undefined) return `Enum values: ${schema.enum.map(String).join(' / ')}; 用于限制 ${schema.title ?? 'value'} 的可选值。`
    if (schema.type === 'array') return `${schema.title ?? 'Array'} array; 表示一组可配置值，元素结构由 items 描述。`
    if (schema.type === 'object') {
      const fields = Object.keys(schema.properties ?? {}).slice(0, 8)
      const fieldText = fields.length > 0 ? `Fields: ${fields.join(', ')}. ` : ''
      return `${schema.title ?? 'Object'} object; ${fieldText}用于描述可递归查询的结构化配置。`
    }
    return `${schema.title ?? 'Schema'} value; 用于描述可配置值。`
  }
  if (relation === 'property') {
    if (options.name === 'dataSource') return 'Runtime data source; 由框架注入的数据上下文，页面配置通常不需要手写。'
    if (options.name === 'persistedValue') return 'Persisted option value; 用于把候选项 ID 或原始值额外回写到宿主字段。'
    return `${options.name ?? 'Property'} property (${describeSchemaType(schema)}); ${options.required === true ? 'required，' : ''}用于配置对象字段。`
  }
  if (relation === 'oneOf') {
    const label = schema.const !== undefined ? String(schema.const) : schema.title ?? `option ${options.index ?? ''}`.trim()
    return `Enum branch ${label}; 表示该枚举可选值。`
  }
  if (relation === 'prefixItem') {
    return `${options.name ?? `payload${(options.index ?? 0) + 1}`} parameter (${describeSchemaType(schema)}); 用于事件 payload 参数。`
  }
  if (relation === 'items') return `Array item (${describeSchemaType(schema)}); 用于描述数组元素。`
  return `${relation} schema (${describeSchemaType(schema)}); 用于描述联合分支。`
}

function createGenericSchemaTitle(schema: PropSchema, relation: SchemaNodeEntry['relation'], options: { name?: string; index?: number }): string | undefined {
  if (schema.title !== undefined) return schema.title
  if (relation === 'property') return options.name
  if (relation === 'prefixItem') return options.name ?? `payload${(options.index ?? 0) + 1}`
  if (relation === 'oneOf' && schema.const !== undefined) return String(schema.const)
  return undefined
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

function parseLiteralExample(value: string): string | number | boolean | null | undefined {
  const trimmed = value.trim()
  if (trimmed === 'undefined' || trimmed.length === 0) return undefined
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed)
  const quoted = /^(['"])([\s\S]*)\1$/u.exec(trimmed)
  return quoted?.[2]
}

function examplesFromTypeText(typeText: string): unknown[] {
  const compactType = typeText.replace(/\s+/g, '')
  if (/\bCollapseValue\b/u.test(typeText)) return ['panel-1']
  if (/\bProgressColor\b/u.test(typeText)) return ['#409eff']
  if (/\bDate\b/u.test(typeText)) return ['2026-01-01']
  if (/\bCascaderValue\b/u.test(typeText)) return [['province', 'city']]
  if (/\bCheckboxGroupMultiValue\b/u.test(typeText)) return [['option-a', 'option-b']]
  if (/\bMultiValue\b/u.test(typeText)) return [['option-a', 'option-b']]
  if (/\bEntityPickerValue\b/u.test(typeText)) return ['entity-001']
  if (/\bTransferValue\b/u.test(typeText)) return [['item-1', 'item-2']]
  if (/\bTreeSelectValue\b/u.test(typeText)) return ['node-1']
  if (/\bSparkNode\b/u.test(typeText)) return [{ type: 'r-text', props: { value: 'text' } }]
  if (/\bICapabilityContext\b/u.test(typeText)) return []
  if (compactType === 'unknown') return ['text']

  const literalExamples = splitTopLevel(typeText, '|')
    .map(parseLiteralExample)
    .filter((value): value is Exclude<ReturnType<typeof parseLiteralExample>, undefined> => value !== undefined)
  if (literalExamples.length > 0) return literalExamples.slice(0, 3)

  const normalized = typeText.toLowerCase()
  if (normalized.includes('=>') || normalized.includes('function') || normalized.includes('promise<')) return []
  if (normalized.includes('boolean')) return [false]
  if (normalized.includes('number') || normalized.includes('integer') || normalized.includes('float')) return [0]
  if (normalized.includes('[]') || normalized.includes('array<') || normalized.includes('readonlyarray<')) return [[]]
  if (normalized.includes('record<') || normalized.includes('object') || normalized.includes('{')) return [{}]
  if (normalized.includes('string')) return ['text']
  return []
}

function examplesFromSchemaShape(schema: PropSchema | undefined): unknown[] {
  if (schema === undefined) return []
  if (schema.default !== undefined) return [schema.default]
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum.slice(0, 3)

  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schemaType === 'array') return [[]]
  if (schemaType === 'boolean') return [false]
  if (schemaType === 'number' || schemaType === 'integer') return [0]
  if (schemaType === 'string') return ['text']
  if (schemaType === 'object' && (schema.required?.length ?? 0) === 0) return [{}]
  return []
}

function createExamplesForName(name: string): unknown[] {
  if (name === 'dataKey') return ['orders@rows']
  if (name === 'field') return ['name']
  if (name === 'rowKey') return ['id']
  if (name === 'pageId') return ['page-main']
  if (name === 'title') return ['订单列表']
  if (name === 'label') return ['保存']
  if (name === 'placeholder') return ['请输入内容']
  if (name === 'icon') return ['ChatRound']
  if (name === 'actionId') return ['refresh']
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
  if (name === 'position') return ['top']
  if (name === 'align') return ['center']
  if (name === 'justify') return ['space-between']
  if (name === 'overflow') return ['queue']
  if (name === 'turnConcurrency') return [{ maxParallelTurns: 1, overflow: 'queue' }]
  if (name === 'fcLoop') return [{ enabled: true, maxRounds: 3 }]
  if (name === '_modelPerm') return [{ allowCreate: true, allowExport: true }]
  if (name === 'aggregateResult') return [{ totalAmount: 1234, count: 2 }]
  if (name === 'selectionAggregateResult') return [{ totalAmount: 1234 }]
  if (name === 'currentRow') return [null]
  if (name === 'requestState') return [3]
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

function createPropExamples(
  name: string,
  type: string,
  schema: PropSchema | undefined,
  defaultValue: unknown,
  sourceExamples: unknown[] = [],
): unknown[] {
  return uniqueExamples([
    ...(defaultValue !== undefined ? [defaultValue] : []),
    ...sourceExamples,
    ...createExamplesForName(name),
    ...(schema?.examples ?? []),
    ...examplesFromSchemaShape(schema),
    ...(schema?.enum?.slice(0, 3) ?? []),
    ...examplesFromTypeText(type),
  ]).slice(0, 3)
}

function createGenericSchemaExamples(schema: PropSchema, relation: SchemaNodeEntry['relation'], options: { name?: string; index?: number }): unknown[] {
  if (schema.const !== undefined) return [schema.const]
  if (schema.default !== undefined) return [schema.default]
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum.slice(0, 3)
  if (schema.type === 'null') return [null]
  if (options.name !== undefined) {
    const namedExamples = createExamplesForName(options.name)
    if (namedExamples.length > 0) return namedExamples
  }
  if (schema.title !== undefined) {
    const titleExamples = examplesFromTypeText(schema.title)
    if (titleExamples.length > 0) return titleExamples
  }
  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schemaType === 'boolean') return [false]
  if (schemaType === 'number' || schemaType === 'integer') return [0]
  if (schemaType === 'array') return [[]]
  if (schemaType === 'object') return [{}]
  if (schemaType === 'string') return [relation === 'prefixItem' ? `${options.name ?? 'value'}` : 'text']
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
  if (binding.selfResolving === true) parts.push('self-resolving dataKey')
  if (binding.dataContainer === true) parts.push('向子组件提供数据上下文')
  if (binding.fieldProvider === true) parts.push('通过 field 绑定行字段')
  if (binding.hasOptions === true) parts.push('支持 options/optionKey 选项数据')
  if (binding.bindingDelegate !== undefined) parts.push(`bindingDelegate=${binding.bindingDelegate}`)
  if (binding.valueType !== undefined) parts.push(`valueType=${binding.valueType}`)
  return parts.length > 0 ? `绑定语义：${parts.join('，')}。` : undefined
}

const COMPONENT_KEY_PROP_ORDER = [
  'dataKey',
  'field',
  'value',
  'modelValue',
  'columns',
  'toolbar',
  'filter',
  'actions',
  'items',
  'options',
  'optionKey',
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

  const keyProps = selectKeyProps(options.props)
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
 * - 复杂 schema 提升为 schemaNodeId；
 * - 若存在组件引用，则写 componentRef 语义标签。
 */
function compactProps(rawProps: PropEntryWithMeta[], schemaPool: SchemaPoolContext): PropEntry[] {
  const result: PropEntry[] = []

  for (const prop of rawProps) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue
    const type = normalizeCatalogTypeText(prop.type)
    const defaultValue = parseJsonSafeDefault(prop.default)
    const examples = createPropExamples(prop.name, type, prop.schema, defaultValue, prop.examples)

    const compacted: PropEntry = {
      name: prop.name,
      type,
      required: prop.required,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      description: prop.description ?? createGenericPropDescription(prop.name, type),
      ...(examples.length > 0 ? { examples } : {}),
    }

    // 语义标签：@componentRef 始终以独立字段落盘，不再与结构 schema 互斥。
    if (prop.__componentRef !== undefined) {
      compacted.componentRef = prop.__componentRef
    }

    // 结构 schema 优先级：
    // 1) VCM 抽取出的真实结构（object/array）——首选；
    // 2) rawType 提取的命名字面量 enum（InlineAlign 等）；
    // 当上述两类都缺失而仅存在 @componentRef 时，schema 留空——
    // 消费层通过独立的 componentRef 字段定位目标组件。
    let schemaResolved = false
    if (prop.schema !== undefined) {
      const schemaWithExamples = annotateSchemaExamples(prop.schema, prop.name, type, defaultValue)
      const normalizedSchema = normalizeNestedSchema(schemaPool, schemaWithExamples)
      const isExternalObjectSchema = isObjectSchema(prop.schema) && prop.__schemaOwner === 'external'
      if (!isExternalObjectSchema && shouldRetainSchema(normalizedSchema)) {
        const ref = resolveSchemaRef(
          schemaPool,
          applyEnumValueDocs(normalizedSchema, prop.__enumValueDocs),
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
      const enumExamples = createPropExamples(prop.name, type, enumSchema, defaultValue, prop.examples)
      if (enumExamples.length > 0) enumSchema.examples = enumExamples
      const documentedEnumSchema = applyEnumValueDocs(enumSchema, prop.__enumValueDocs)
      if (shouldRetainSchema(documentedEnumSchema)) {
        compacted.schemaNodeId = resolveSchemaRef(schemaPool, documentedEnumSchema)
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

function compactEmits(rawEmits: EmitEntry[], schemaPool: SchemaPoolContext, componentType: string): EmitEntry[] {
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
          title: `${componentType}.${emit.name}${type !== undefined ? ` ${type}` : ''}`,
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
        compacted.schemaNodeId = resolveSchemaRef(schemaPool, eventSchema)
      }
    }

    result.push(compacted)
  }

  return result
}

/**
 * 生成用于写盘的 payload。
 *
 * 运行态 catalog 会保留更多内部字段，但磁盘产物需要做瘦身：
 * - components.* 保留 props/emits，删除 source/binding。
 *
 * 这样既保留运行态信息，又维持落盘 JSON 的稳定与紧凑。
 */
function createCatalogFilePayload(catalog: ComponentCatalog): unknown {
  const payload = deepClone(catalog) as unknown as {
    components?: Record<string, Record<string, unknown> & {
      props?: Array<Record<string, unknown>>
      emits?: Array<Record<string, unknown>>
    }>
  }

  const components = payload.components
  if (components !== undefined) {
    for (const entry of Object.values(components)) {
      delete entry['source']
      delete entry['binding']
      for (const prop of entry.props ?? []) delete prop['schema']
      for (const emit of entry.emits ?? []) {
        delete emit['schema']
        delete emit['__payloadSchemas']
        delete emit['__payloadParamDocs']
      }
    }
  }

  return payload
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
    for (const prop of entry.props) visit(prop.schemaNodeId)
    for (const emit of entry.emits) {
      visit(emit.schemaNodeId)
    }
  }

  if (reachable.size === 0) return undefined

  return Object.fromEntries(
    [...reachable]
      .sort((left, right) => left.localeCompare(right))
      .map((ref) => [ref, schemas[ref]]),
  ) as Record<string, PropSchema>
}

function escapeNodeSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function childNodeId(parentId: string, relation: string, key: string | number): string {
  return `${parentId}/${relation}/${escapeNodeSegment(String(key))}`
}

function schemaToNodes(
  schema: PropSchema,
  id: string,
  rootId: string,
  relation: SchemaNodeEntry['relation'],
  parentId?: string,
  options: { name?: string; index?: number; required?: boolean } = {},
): SchemaNodeEntry[] {
  const title = createGenericSchemaTitle(schema, relation, options)
  const examples = schema.examples ?? createGenericSchemaExamples(schema, relation, options)
  const node: SchemaNodeEntry = {
    id,
    rootId,
    relation,
    ...(parentId !== undefined ? { parentId } : {}),
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(options.index !== undefined ? { index: options.index } : {}),
    ...(options.required !== undefined ? { required: options.required } : {}),
    ...(schema.$ref !== undefined ? { refId: schema.$ref } : {}),
    ...(schema.type !== undefined ? { type: schema.type } : {}),
    ...(title !== undefined ? { title } : {}),
    description: schema.description ?? createGenericSchemaDescription(schema, relation, options),
    ...(schema.enum !== undefined ? { enum: schema.enum } : {}),
    ...(schema.const !== undefined ? { const: schema.const } : {}),
    ...(schema.default !== undefined ? { default: schema.default } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  }

  const nodes: SchemaNodeEntry[] = [node]
  const requiredNames = new Set(schema.required ?? [])

  if (schema.properties !== undefined) {
    for (const [name, property] of Object.entries(schema.properties)) {
      nodes.push(
        ...schemaToNodes(
          property,
          childNodeId(id, 'properties', name),
          rootId,
          'property',
          id,
          { name, required: requiredNames.has(name) },
        ),
      )
    }
  }

  if (schema.items !== undefined) {
    nodes.push(...schemaToNodes(schema.items, childNodeId(id, 'items', 0), rootId, 'items', id))
  }

  for (const [index, item] of (schema.prefixItems ?? []).entries()) {
    nodes.push(...schemaToNodes(item, childNodeId(id, 'prefixItems', index), rootId, 'prefixItem', id, { index, ...(item.title !== undefined ? { name: item.title } : {}) }))
  }

  for (const [index, item] of (schema.oneOf ?? []).entries()) {
    nodes.push(...schemaToNodes(item, childNodeId(id, 'oneOf', index), rootId, 'oneOf', id, { index }))
  }

  for (const [index, item] of (schema.anyOf ?? []).entries()) {
    nodes.push(...schemaToNodes(item, childNodeId(id, 'anyOf', index), rootId, 'anyOf', id, { index }))
  }

  return nodes
}

function createSchemaNodes(schemas: Record<string, PropSchema> | undefined): SchemaNodeEntry[] | undefined {
  if (schemas === undefined) return undefined
  const nodes = Object.entries(schemas)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([id, schema]) => schemaToNodes(schema, id, id, 'root'))
  return nodes.length > 0 ? nodes : undefined
}

// ── 7. 组件扫描与目录构建 (Scanner & Builder) ─────────────────────────────────────

/**
 * 扫描输入文件并构建完整目录模型。
 *
 * 该阶段负责：
 * - 建立 TS / Vue 检查器；
 * - 提取每个组件的 VCM API；
 * - 生成组件条目、bindingDescriptors、schemaNodes；
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

  for (const file of sortedFiles) {
    const abs = resolve(root, file)

    // 组件 type 统一来源于推断后的 kebab-case 名称；无法识别的文件直接跳过。
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

    const props = compactProps(rawProps, schemaPool)
    const emits = compactEmits(vcmApi.emits, schemaPool, type)
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
    schemas: schemaPool.pool,
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
    schemas,
  } = buildSortedComponents(root, files, includeGlobalProps, tsconfigPath, vcmCheckerOptions)
  const reachableSchemas = pruneReachableSchemas(components, schemas)
  const schemaNodes = createSchemaNodes(reachableSchemas)

  // 运行态 catalog 保留完整字段，供审计和调用方继续加工。
  const catalog: ComponentCatalog = {
    version: '4.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(components).length,
    components,
    sharedTypes: {},
    ...(schemaNodes !== undefined ? { schemaNodes } : {}),
    constraints: DEFAULT_CONSTRAINTS,
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
