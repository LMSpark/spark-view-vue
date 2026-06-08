/**
 * Vue 组件目录 provider：将 component-catalog.json 投影为 queryPayloads / guidePayload 知识。
 */
import type { AiJsonSchemaObject, AiJsonValue } from '@spark-appworks/spark-ai/json'
import type {
  AiModulePayloadGuide,
  AiModulePayloadProvider,
  AiModulePayloadQueryFilter,
  AiModulePayloadSummary,
} from '@spark-appworks/spark-ai/modules'
import { isRecord } from '@spark-appworks/spark-utils'
import type {
  SparkComponentCatalogDocument,
  SparkComponentCatalogEntry,
  SparkComponentCatalogProp,
} from './spark-component-catalog-types'

export const SPARK_COMPONENT_PAYLOAD_REF = 'spark.component'
export const SPARK_COMPONENT_CONSUMER_KIND = 'node-tree'

const DEFAULT_QUERY_LIMIT = 24
const MAX_QUERY_LIMIT = 100

export function createSparkComponentCatalogProvider(
  catalog: SparkComponentCatalogDocument,
): AiModulePayloadProvider {
  const entries = listConfigurableEntries(catalog)

  return {
    moduleKind: SPARK_COMPONENT_CONSUMER_KIND,
    payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
    description: 'Vue SparkNode 组件契约目录（type / props / emits）。',
    queryPayloads: (filter = {}) => queryCatalogSummaries(entries, filter),
    guidePayload: (key) => guideCatalogEntry(catalog, entries, key),
  }
}

function listConfigurableEntries(
  catalog: SparkComponentCatalogDocument,
): readonly SparkComponentCatalogEntry[] {
  return Object.values(catalog.components)
    .filter(isConfigurableCatalogEntry)
    .sort((left, right) => left.type.localeCompare(right.type))
}

function isConfigurableCatalogEntry(entry: SparkComponentCatalogEntry): boolean {
  if (entry.internal === true) return false
  if (entry.configurable === false) return false
  return entry.type.trim().length > 0
}

function queryCatalogSummaries(
  entries: readonly SparkComponentCatalogEntry[],
  filter: AiModulePayloadQueryFilter,
): readonly AiModulePayloadSummary[] {
  const key = normalizeFilterText(filter.key)
  const category = normalizeFilterText(filter.category)?.toLowerCase()
  const keyword = normalizeFilterText(filter.keyword)?.toLowerCase()
  const limit = normalizeLimit(filter.limit)

  const matched = entries.filter((entry) => {
    if (key !== undefined && entry.type !== key) return false
    if (category !== undefined && entry.category?.toLowerCase() !== category) return false
    if (keyword !== undefined) {
      const haystack = `${entry.type} ${entry.description ?? ''} ${entry.category ?? ''}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (filter.configurableOnly === true && !isConfigurableCatalogEntry(entry)) return false
    return true
  })

  return matched.slice(0, limit).map((entry) => ({
    moduleKind: SPARK_COMPONENT_CONSUMER_KIND,
    payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
    key: entry.type,
    description: entry.description ?? entry.type,
    ...(entry.category === undefined ? {} : { category: entry.category }),
    metadata: {
      propCount: entry.props?.length ?? 0,
      emitCount: entry.emits?.length ?? 0,
    },
  }))
}

function guideCatalogEntry(
  catalog: SparkComponentCatalogDocument,
  entries: readonly SparkComponentCatalogEntry[],
  key: string,
): AiModulePayloadGuide | null {
  const normalizedKey = key.trim()
  if (normalizedKey.length === 0) return null
  const entry = entries.find(candidate => candidate.type === normalizedKey)
  if (entry === undefined) return null

  return {
    moduleKind: SPARK_COMPONENT_CONSUMER_KIND,
    payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
    key: entry.type,
    description: entry.description ?? entry.type,
    paramsSchema: buildSparkNodeParamsSchema(entry, catalog.$defs),
    minimalParams: { type: entry.type, props: buildMinimalProps(entry) } as AiJsonValue,
    sourceGuide: serializeCatalogEntry(entry),
    usageRules: [
      'SparkNode.type 必须等于 guide key；禁止发明 schema 外 props 字段。',
      'dataViewKey 格式为 table@viewId 或 #scope@table@viewId；dataMember 使用 rows/currentRow 等枚举。',
      '回调型 props 优先在 script.js 声明，不在 rule.json 内联函数体。',
    ],
    failureModes: [
      {
        code: 'UNKNOWN_PROP',
        when: 'props 含 schema 未声明字段',
        fix: '回到 guidePayload 核对 props.properties；additionalProperties 为 false 时禁止扩展字段。',
      },
    ],
  }
}

function buildSparkNodeParamsSchema(
  entry: SparkComponentCatalogEntry,
  defs?: Readonly<Record<string, AiJsonSchemaObject>>,
): AiJsonSchemaObject {
  const propProperties: Record<string, AiJsonSchemaObject> = {}
  const propRequired: string[] = []
  for (const prop of entry.props ?? []) {
    propProperties[prop.name] = resolvePropSchema(prop, defs)
    if (prop.required === true) propRequired.push(prop.name)
  }

  return {
    type: 'object',
    properties: {
      type: { type: 'string', const: entry.type },
      id: { type: 'string', description: '组件实例 id；省略时由运行时分配。' },
      props: {
        type: 'object',
        properties: propProperties,
        ...(propRequired.length > 0 ? { required: propRequired } : {}),
        additionalProperties: false,
      },
      children: {
        type: 'array',
        description: '子 SparkNode 列表；容器组件按需嵌套。',
        items: { type: 'object', additionalProperties: true },
      },
    },
    required: ['type'],
    additionalProperties: false,
  }
}

function readCatalogPropTypeText(prop: SparkComponentCatalogProp): string {
  const typeText = prop.typeText?.trim()
  if (typeText !== undefined && typeText.length > 0) return typeText
  return prop.type?.trim() ?? ''
}

function resolvePropSchema(
  prop: SparkComponentCatalogProp,
  defs?: Readonly<Record<string, AiJsonSchemaObject>>,
): AiJsonSchemaObject {
  if (prop.schema !== undefined) {
    return inlineSchemaRefs(prop.schema, defs)
  }
  const typeText = readCatalogPropTypeText(prop)
  if (typeText.length > 0) {
    return {
      type: 'string',
      description: prop.description ?? typeText,
    }
  }
  return { description: prop.description ?? prop.name }
}

function inlineSchemaRefs(
  schema: AiJsonSchemaObject,
  defs?: Readonly<Record<string, AiJsonSchemaObject>>,
): AiJsonSchemaObject {
  if (defs === undefined) return schema
  const ref = schema.$ref
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const defName = ref.slice('#/$defs/'.length)
    const resolved = defs[defName]
    if (resolved !== undefined) {
      return schema.description === undefined
        ? resolved
        : { ...resolved, description: schema.description }
    }
  }
  return schema
}

function serializeCatalogEntry(entry: SparkComponentCatalogEntry): AiJsonValue {
  return JSON.parse(JSON.stringify(entry)) as AiJsonValue
}

function buildMinimalProps(entry: SparkComponentCatalogEntry): Record<string, AiJsonValue> {
  const props: Record<string, AiJsonValue> = {}
  for (const prop of entry.props ?? []) {
    if (prop.required !== true) continue
    if (prop.default !== undefined && prop.default.trim().length > 0) {
      props[prop.name] = prop.default
      continue
    }
    const firstEnumValue = readFirstJsonEnumValue(prop.schema)
    if (firstEnumValue !== undefined) {
      props[prop.name] = firstEnumValue
      continue
    }
    if (readCatalogPropTypeText(prop).includes('boolean')) {
      props[prop.name] = false
      continue
    }
    props[prop.name] = ''
  }
  return props
}

function readFirstJsonEnumValue(schema: AiJsonSchemaObject | undefined): AiJsonValue | undefined {
  const values = schema?.enum
  if (!Array.isArray(values) || values.length === 0) return undefined
  const value: unknown = values[0]
  return isJsonScalar(value) ? value : undefined
}

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function normalizeFilterText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_QUERY_LIMIT
  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(value)))
}

export function readSparkComponentCatalogDocument(value: unknown): SparkComponentCatalogDocument {
  if (!isRecord(value)) {
    throw new Error('component catalog document must be an object.')
  }
  const components = value['components']
  if (!isRecord(components)) {
    throw new Error('component catalog document requires components object.')
  }
  return value as SparkComponentCatalogDocument
}
