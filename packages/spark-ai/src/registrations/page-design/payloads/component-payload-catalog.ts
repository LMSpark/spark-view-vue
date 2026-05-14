import { queryComponentCatalog } from './catalog-query'
import { projectComponentConfigGuide, projectComponentDirectory } from './catalog-projections'
import { COMPONENT_CATALOG_JSON } from './component-catalog-source'
import type { PropSchema } from './types'
import type {
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonValue,
  LlmParameterSchemaRoot,
  ParameterPayloadGuide,
  ParameterPayloadQueryFilter,
  ParameterPayloadSummary,
} from '../../../core'

export const SPARK_COMPONENT_PAYLOAD_REF = 'spark.component'

export const SPARK_COMPONENT_PAYLOAD_DESCRIPTION = 'SparkNode 组件目录；queryPayloads 返回组件 type 摘要，guidePayload(key) 返回单组件参数 schema。'

const DEFAULT_COMPONENT_DIRECTORY_LIMIT = 24
const MAX_COMPONENT_DIRECTORY_LIMIT = 40

const PAGE_DESIGN_COMPONENT_DIRECTORY = projectComponentDirectory(COMPONENT_CATALOG_JSON)

const PAGE_DESIGN_COMPONENT_DIRECTORY_ENTRIES = PAGE_DESIGN_COMPONENT_DIRECTORY.components
  .map(component => ({
    key: component.type,
    category: component.category,
    description: component.description,
  }))
  .sort((left, right) => left.key.localeCompare(right.key))

const PAGE_DESIGN_COMPONENT_DIRECTORY_SUMMARIES = PAGE_DESIGN_COMPONENT_DIRECTORY.components
  .map(component => ({
    key: component.type,
    description: component.description,
  }))
  .sort((left, right) => left.key.localeCompare(right.key))

const PAGE_DESIGN_COMPONENT_DIRECTORY_SUMMARY_BY_KEY = new Map(
  PAGE_DESIGN_COMPONENT_DIRECTORY_SUMMARIES.map(summary => [summary.key, summary]),
)

const PAGE_DESIGN_COMPONENT_DIRECTORY_ENTRY_BY_KEY = new Map(
  PAGE_DESIGN_COMPONENT_DIRECTORY_ENTRIES.map(entry => [entry.key, entry]),
)

const PAGE_DESIGN_COMPONENT_DIRECTORY_QUERY_DATA = {
  payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
  summary: PAGE_DESIGN_COMPONENT_DIRECTORY.summary,
  registry: PAGE_DESIGN_COMPONENT_DIRECTORY.registry,
  capabilities: PAGE_DESIGN_COMPONENT_DIRECTORY.capabilities,
  components: PAGE_DESIGN_COMPONENT_DIRECTORY.components.map(component => ({
    payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
    key: component.type,
    type: component.type,
    category: component.category,
    description: component.description,
  })),
}

interface ComponentPropGuide {
  name: string
  type: string
  default?: string
  description?: string
  schema?: PropSchema
}

function parseLiteralUnion(typeText: string): string[] {
  const values = typeText
    .split('|')
    .map(part => part.trim())
    .filter(part => /^['"].*['"]$/u.test(part))
    .map(part => part.slice(1, -1))

  return values.length > 0 ? values : []
}

function describeDefault(prop: ComponentPropGuide): string {
  return prop.default === undefined ? '' : ` 默认值提示: ${prop.default}`
}

function schemaPrimaryType(schema: PropSchema | undefined): string | undefined {
  if (schema === undefined) return undefined
  return Array.isArray(schema.type) ? schema.type[0] : schema.type
}

function enumValuesFromSchema(schema: PropSchema | undefined): Array<string | number> {
  if (schema === undefined) return []
  const direct = (schema.enum ?? []).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
  if (direct.length > 0) return direct
  return (schema.oneOf ?? [])
    .map(item => item.const)
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
}

function noteFromSchema(schema: PropSchema | undefined, prop: ComponentPropGuide, fallback: string): string {
  const description = schema?.description ?? prop.description ?? fallback
  const defaultValue = schema?.default !== undefined ? ` 默认值提示: ${JSON.stringify(schema.default)}` : describeDefault(prop)
  return `${description}${defaultValue}`.trim()
}

function withDescription(schema: LlmJsonSchemaObject, description: string): LlmJsonSchemaObject {
  return {
    ...schema,
    description: schema.description ?? description,
  }
}

function inferParamSchemaFromJsonSchema(schema: PropSchema | undefined, prop: ComponentPropGuide): LlmJsonSchema | undefined {
  if (schema === undefined) return undefined

  const enumValues = enumValuesFromSchema(schema)
  if (enumValues.length > 0) {
    const enumType = enumValues.some(value => typeof value === 'number') ? 'number' : 'string'
    return {
      type: enumType,
      enum: enumValues,
      description: noteFromSchema(schema, prop, '可选值'),
    }
  }

  if (schema.const !== undefined) {
    if (typeof schema.const === 'string' || typeof schema.const === 'number') {
      return {
        type: typeof schema.const === 'number' ? 'number' : 'string',
        const: schema.const,
        description: noteFromSchema(schema, prop, '固定值'),
      }
    }
    if (typeof schema.const === 'boolean' || schema.const === null) {
      return {
        type: typeof schema.const === 'boolean' ? 'boolean' : 'null',
        const: schema.const,
        description: noteFromSchema(schema, prop, '固定值'),
      }
    }
    return {
      description: noteFromSchema(schema, prop, '固定值'),
    }
  }

  const schemaType = schemaPrimaryType(schema)
  if (schemaType === 'array') {
    const itemSchema = schema.items === undefined
      ? undefined
      : inferParamSchemaFromJsonSchema(schema.items, prop) ?? {}
    return {
      type: 'array',
      ...(itemSchema !== undefined ? { items: itemSchema } : {}),
      description: noteFromSchema(schema, prop, '数组参数'),
    }
  }
  if (schemaType === 'object' || schema.properties !== undefined) {
    const required = new Set(schema.required ?? [])
    const properties: Record<string, LlmJsonSchema> = {}
    for (const [name, propertySchema] of Object.entries(schema.properties ?? {})) {
      const propertyProp: ComponentPropGuide = {
        name,
        type: typeof propertySchema.type === 'string' ? propertySchema.type : name,
        ...(propertySchema.description !== undefined ? { description: propertySchema.description } : {}),
        ...(propertySchema.default !== undefined ? { default: JSON.stringify(propertySchema.default) } : {}),
        schema: propertySchema,
      }
      const propertyNode = inferParamSchemaFromJsonSchema(propertySchema, propertyProp)
        ?? inferParamSchemaFromTypeText(propertyProp)
      properties[name] = propertyNode
    }
    const schemaRecord = schema as PropSchema & { additionalProperties?: LlmJsonSchema }
    return {
      type: 'object',
      ...(required.size > 0 ? { required: [...required] } : {}),
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
      ...(schemaRecord.additionalProperties !== undefined ? { additionalProperties: schemaRecord.additionalProperties } : {}),
      description: noteFromSchema(schema, prop, '对象参数'),
    }
  }
  const schemaRecord = schema as PropSchema & { allOf?: readonly LlmJsonSchema[] }
  if (schemaRecord.oneOf !== undefined || schemaRecord.anyOf !== undefined || schemaRecord.allOf !== undefined) {
    return withDescription(schema as LlmJsonSchemaObject, noteFromSchema(schema, prop, '参数'))
  }
  if (schemaType === 'boolean') return { type: 'boolean', description: noteFromSchema(schema, prop, '布尔参数') }
  if (schemaType === 'number' || schemaType === 'integer') return { type: schemaType, description: noteFromSchema(schema, prop, '数字参数') }
  if (schemaType === 'string') return { type: 'string', description: noteFromSchema(schema, prop, '字符串参数') }
  return undefined
}

function inferParamSchemaFromTypeText(prop: ComponentPropGuide): LlmJsonSchema {
  const schemaNode = inferParamSchemaFromJsonSchema(prop.schema, prop)
  if (schemaNode !== undefined) return schemaNode

  const typeText = prop.type
  const normalized = typeText.trim().toLowerCase()
  const enumValues = parseLiteralUnion(typeText)
  if (enumValues.length > 0) {
    return {
      type: 'string',
      enum: enumValues,
      description: `${prop.description ?? '可选值'}${describeDefault(prop)}`.trim(),
    }
  }

  if (normalized.includes('boolean')) {
    return { type: 'boolean', description: `${prop.description ?? '布尔参数'}${describeDefault(prop)}`.trim() }
  }
  if (normalized.includes('number') || normalized.includes('integer') || normalized.includes('float')) {
    return { type: 'number', description: `${prop.description ?? '数字参数'}${describeDefault(prop)}`.trim() }
  }
  if (normalized.includes('array') || normalized.includes('[]')) {
    return {
      type: 'array',
      items: {},
      description: `${prop.description ?? '数组参数'}${describeDefault(prop)}`.trim(),
    }
  }
  if (normalized.includes('record') || normalized.includes('object') || normalized.includes('{')) {
    return {
      type: 'object',
      additionalProperties: true,
      description: `${prop.description ?? '对象参数'}${describeDefault(prop)}`.trim(),
    }
  }
  return { type: 'string', description: `${prop.description ?? '字符串参数'}${describeDefault(prop)}`.trim() }
}

function normalizeLimit(limit: unknown): number | undefined {
  if (limit === undefined) return undefined
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    throw new Error(`${SPARK_COMPONENT_PAYLOAD_REF} filter.limit 必须是大于 0 的数字`)
  }
  return Math.min(Math.floor(limit), MAX_COMPONENT_DIRECTORY_LIMIT)
}

function normalizeFilter(filter: ParameterPayloadQueryFilter | undefined): ParameterPayloadQueryFilter {
  if (filter === undefined) return {}
  if (filter['category'] !== undefined && typeof filter['category'] !== 'string') {
    throw new Error(`${SPARK_COMPONENT_PAYLOAD_REF} filter.category 必须是字符串`)
  }
  if (filter['keyword'] !== undefined && typeof filter['keyword'] !== 'string') {
    throw new Error(`${SPARK_COMPONENT_PAYLOAD_REF} filter.keyword 必须是字符串`)
  }
  if (filter['expression'] !== undefined && typeof filter['expression'] !== 'string') {
    throw new Error(`${SPARK_COMPONENT_PAYLOAD_REF} filter.expression 必须是字符串`)
  }
  const limit = normalizeLimit(filter['limit'])
  return {
    ...(typeof filter['category'] === 'string' && filter['category'].trim().length > 0
      ? { category: filter['category'].trim() }
      : {}),
    ...(typeof filter['keyword'] === 'string' && filter['keyword'].trim().length > 0
      ? { keyword: filter['keyword'].trim().toLowerCase() }
      : {}),
    ...(typeof filter['expression'] === 'string' && filter['expression'].trim().length > 0
      ? { expression: filter['expression'].trim() }
      : {}),
    ...(limit !== undefined ? { limit } : {}),
  }
}

function matchesFilter(summary: ParameterPayloadSummary, filter: ParameterPayloadQueryFilter): boolean {
  const canonical = PAGE_DESIGN_COMPONENT_DIRECTORY_ENTRY_BY_KEY.get(summary.key) ?? summary
  if (filter.category !== undefined && canonical.category !== filter.category) return false
  if (filter.keyword !== undefined) {
    const haystack = `${canonical.key} ${canonical.description ?? ''} ${canonical.category ?? ''}`.toLowerCase()
    return haystack.includes(filter.keyword)
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveSummaryByKey(key: string): ParameterPayloadSummary | null {
  return PAGE_DESIGN_COMPONENT_DIRECTORY_SUMMARY_BY_KEY.get(key) ?? null
}

function resolveProjectedSummary(value: unknown): ParameterPayloadSummary | null {
  if (typeof value === 'string') return resolveSummaryByKey(value)
  if (Array.isArray(value) && typeof value[0] === 'string') return resolveSummaryByKey(value[0])
  if (!isRecord(value)) return null

  const key = typeof value['key'] === 'string'
    ? value['key']
    : typeof value['type'] === 'string'
      ? value['type']
      : undefined

  return key === undefined ? null : resolveSummaryByKey(key)
}

function queryDirectoryByExpression(expression: string): ParameterPayloadSummary[] {
  const projected = queryComponentCatalog<unknown>(expression, {
    data: PAGE_DESIGN_COMPONENT_DIRECTORY_QUERY_DATA,
  })
  const values = Array.isArray(projected) ? projected : [projected]
  const summaries: ParameterPayloadSummary[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const summary = resolveProjectedSummary(value)
    if (summary === null || seen.has(summary.key)) continue
    seen.add(summary.key)
    summaries.push(summary)
  }

  return summaries
}

function buildSparkNodeParamsSchema(type: string, requiredProps: ComponentPropGuide[], optionalProps: ComponentPropGuide[]): LlmParameterSchemaRoot {
  const propsProperties: Record<string, LlmJsonSchema> = {}
  for (const prop of [...requiredProps, ...optionalProps]) {
    propsProperties[prop.name] = inferParamSchemaFromTypeText(prop)
  }

  return {
    type: 'object',
    required: ['type', 'props'],
    properties: {
      id: {
        type: 'string',
        description: 'SparkNode 稳定 id；新增节点时可省略，由宿主生成。',
      },
      type: {
        type: 'string',
        const: type,
        description: 'Spark 组件 type，必须与 payload key 完全一致。',
      },
      props: {
        type: 'object',
        required: requiredProps.map(prop => prop.name),
        properties: propsProperties,
        additionalProperties: true,
        description: '组件 props 参数；required props 必须显式传入。',
      },
      children: {
        type: 'array',
        items: {},
        description: '子 SparkNode 列表；是否允许子节点以组件 nestingRule 和函数指南为准。',
      },
    },
    description: '这是可直接作为 nodeTree 写函数 node 参数使用的参数 schema。',
  }
}

export function guidePageDesignComponentPayload(key: string): ParameterPayloadGuide | null {
  const normalizedKey = key.trim()
  if (normalizedKey.length === 0) return null

  const guide = projectComponentConfigGuide(COMPONENT_CATALOG_JSON, normalizedKey)
  if (guide === null) return null

  return {
    payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
    key: guide.type,
    description: `${guide.type} SparkNode 参数荷载指南`,
    paramsSchema: buildSparkNodeParamsSchema(guide.type, guide.requiredProps, guide.optionalProps),
    minimalParams: guide.minimalConfig as LlmJsonValue,
    sourceGuide: guide as unknown as LlmJsonValue,
    usageRules: [
      '构造 nodeTree 写函数的 node 参数前，必须以本 paramsSchema 为准。',
      'required props 必须显式传入；default 只能作为默认值提示，不能代替业务值判断。',
      '事件绑定只能使用 eventGuide / emits 中声明的事件名。',
      ...guide.failFastChecks,
    ],
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: `key 不存在于 ${SPARK_COMPONENT_PAYLOAD_REF} 参数荷载目录。`,
        fix: '先调用 queryPayloads 重新选择可用组件。',
      },
    ],
  }
}

export function queryPageDesignComponentPayloads(filter?: ParameterPayloadQueryFilter): ParameterPayloadSummary[] {
  const normalizedFilter = normalizeFilter(filter)
  const limit = normalizedFilter.limit ?? DEFAULT_COMPONENT_DIRECTORY_LIMIT
  const sourceItems = normalizedFilter.expression !== undefined
    ? queryDirectoryByExpression(normalizedFilter.expression)
    : PAGE_DESIGN_COMPONENT_DIRECTORY_SUMMARIES

  return sourceItems
    .filter(summary => matchesFilter(summary, normalizedFilter))
    .slice(0, limit)
}
