import { projectComponentConfigGuide, projectFunctionCatalog } from './catalog-projections'
import { COMPONENT_CATALOG_JSON } from './component-catalog-source'
import type { PropSchema } from './types'
import type {
  LlmJsonObject,
  LlmJsonValue,
  LlmParameterSchemaNode,
  LlmParameterSchemaRoot,
  ParameterPayloadGuide,
  ParameterPayloadQueryFilter,
  ParameterPayloadSummary,
} from '../../../core'

export const SPARK_COMPONENT_PAYLOAD_REF = 'spark.component'

export const SPARK_COMPONENT_PAYLOAD_DESCRIPTION = 'SparkNode 组件参数荷载目录；key 为组件 type，如 r-table。'

const PAGE_DESIGN_FUNCTION_CATALOG = projectFunctionCatalog(COMPONENT_CATALOG_JSON)

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

function describeProp(prop: ComponentPropGuide): string {
  return prop.description === undefined ? '' : ` — ${prop.description}`
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

function inferParamSchemaFromJsonSchema(schema: PropSchema | undefined, prop: ComponentPropGuide): LlmParameterSchemaNode | undefined {
  if (schema === undefined) return undefined

  const enumValues = enumValuesFromSchema(schema)
  if (enumValues.length > 0) {
    const enumType = enumValues.some(value => typeof value === 'number') ? 'number' : 'string'
    return {
      kind: 'enum',
      type: enumType,
      enum: enumValues,
      openEnded: false,
      note: noteFromSchema(schema, prop, '可选值'),
    }
  }

  if (schema.const !== undefined) {
    if (typeof schema.const === 'string' || typeof schema.const === 'number') {
      return {
        kind: 'enum',
        type: typeof schema.const === 'number' ? 'number' : 'string',
        enum: [schema.const],
        openEnded: false,
        note: noteFromSchema(schema, prop, '固定值'),
      }
    }
    return `${typeof schema.const}${describeProp(prop)}${describeDefault(prop)}`
  }

  const schemaType = schemaPrimaryType(schema)
  if (schemaType === 'array') {
    const itemSchema = schema.items === undefined
      ? undefined
      : (inferParamSchemaFromJsonSchema(schema.items, prop) ?? 'unknown — 数组元素') as LlmJsonValue
    return {
      kind: 'array',
      ...(itemSchema !== undefined ? { items: itemSchema } : {}),
      note: noteFromSchema(schema, prop, '数组参数'),
    }
  }
  if (schemaType === 'object' || schema.properties !== undefined) {
    const required = new Set(schema.required ?? [])
    const properties: Record<string, LlmParameterSchemaNode> = {}
    const optional: Record<string, LlmParameterSchemaNode> = {}
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
      if (required.has(name)) properties[name] = propertyNode
      else optional[name] = propertyNode
    }
    return {
      kind: 'object',
      ...(required.size > 0 ? { required: [...required] } : {}),
      ...(Object.keys(properties).length > 0 ? { properties: properties as LlmJsonObject } : {}),
      ...(Object.keys(optional).length > 0 ? { optional: optional as LlmJsonObject } : {}),
      note: noteFromSchema(schema, prop, '对象参数'),
    }
  }
  if (schemaType === 'boolean') return `boolean${describeProp(prop)}${describeDefault(prop)}`
  if (schemaType === 'number' || schemaType === 'integer') return `number${describeProp(prop)}${describeDefault(prop)}`
  if (schemaType === 'string') return `string${describeProp(prop)}${describeDefault(prop)}`
  return undefined
}

function inferParamSchemaFromTypeText(prop: ComponentPropGuide): LlmParameterSchemaNode {
  const schemaNode = inferParamSchemaFromJsonSchema(prop.schema, prop)
  if (schemaNode !== undefined) return schemaNode

  const typeText = prop.type
  const normalized = typeText.trim().toLowerCase()
  const enumValues = parseLiteralUnion(typeText)
  if (enumValues.length > 0) {
    return {
      kind: 'enum',
      type: 'string',
      enum: enumValues,
      note: `${prop.description ?? '可选值'}${describeDefault(prop)}`.trim(),
    }
  }

  if (normalized.includes('boolean')) return `boolean${describeProp(prop)}${describeDefault(prop)}`
  if (normalized.includes('number') || normalized.includes('integer') || normalized.includes('float')) {
    return `number${describeProp(prop)}${describeDefault(prop)}`
  }
  if (normalized.includes('array') || normalized.includes('[]')) {
    return {
      kind: 'array',
      items: 'unknown — 数组元素',
      note: `${prop.description ?? '数组参数'}${describeDefault(prop)}`.trim(),
    }
  }
  if (normalized.includes('record') || normalized.includes('object') || normalized.includes('{')) {
    return {
      kind: 'object',
      additionalProperties: 'unknown — 对象字段值',
      note: `${prop.description ?? '对象参数'}${describeDefault(prop)}`.trim(),
    }
  }
  return `string${describeProp(prop)}${describeDefault(prop)}`
}

function normalizeFilter(filter: ParameterPayloadQueryFilter | undefined): ParameterPayloadQueryFilter {
  if (filter === undefined) return {}
  if (filter['category'] !== undefined && typeof filter['category'] !== 'string') {
    throw new Error(`${SPARK_COMPONENT_PAYLOAD_REF} filter.category 必须是字符串`)
  }
  if (filter['keyword'] !== undefined && typeof filter['keyword'] !== 'string') {
    throw new Error(`${SPARK_COMPONENT_PAYLOAD_REF} filter.keyword 必须是字符串`)
  }
  return {
    ...(typeof filter['category'] === 'string' && filter['category'].trim().length > 0
      ? { category: filter['category'].trim() }
      : {}),
    ...(typeof filter['keyword'] === 'string' && filter['keyword'].trim().length > 0
      ? { keyword: filter['keyword'].trim().toLowerCase() }
      : {}),
  }
}

function matchesFilter(summary: ParameterPayloadSummary, filter: ParameterPayloadQueryFilter): boolean {
  if (filter.category !== undefined && summary.category !== filter.category) return false
  if (filter.keyword !== undefined) {
    const haystack = `${summary.key} ${summary.description} ${summary.tags?.join(' ') ?? ''}`.toLowerCase()
    return haystack.includes(filter.keyword)
  }
  return true
}

function buildSparkNodeParamsSchema(type: string, requiredProps: ComponentPropGuide[], optionalProps: ComponentPropGuide[]): LlmParameterSchemaRoot {
  const propsProperties: Record<string, LlmParameterSchemaNode> = {}
  for (const prop of [...requiredProps, ...optionalProps]) {
    propsProperties[prop.name] = inferParamSchemaFromTypeText(prop)
  }

  return {
    kind: 'object',
    required: ['type', 'props'],
    properties: {
      id: 'string? — SparkNode 稳定 id；新增节点时可省略，由宿主生成。',
      type: {
        kind: 'enum',
        type: 'string',
        enum: [type],
        openEnded: false,
        note: 'Spark 组件 type，必须与 payload key 完全一致。',
      },
      props: {
        kind: 'object',
        required: requiredProps.map(prop => prop.name),
        properties: propsProperties as LlmJsonObject,
        additionalProperties: 'unknown — 组件扩展 props',
        note: '组件 props 参数；required props 必须显式传入。',
      },
      children: {
        kind: 'array',
        items: 'unknown — SparkNode / string / number 子节点',
        note: '子 SparkNode 列表；是否允许子节点以组件 nestingRule 和函数指南为准。',
      },
    },
    note: '这是可直接作为 nodeTree 写函数 node 参数使用的参数 schema。',
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
  return Object.entries(PAGE_DESIGN_FUNCTION_CATALOG.components)
    .map(([key, entry]) => ({
      payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
      key,
      category: entry.category,
      description: entry.description,
      tags: [entry.category],
    }))
    .filter(summary => matchesFilter(summary, normalizedFilter))
    .sort((left, right) => left.key.localeCompare(right.key))
}
