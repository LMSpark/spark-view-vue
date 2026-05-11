import rawComponentCatalogJson from './component-catalog.json'
import { projectComponentConfigGuide, projectFunctionCatalog, projectFrameworkNeutralCatalog } from './catalog-projections'
import type { ComponentCatalog } from './types'
import type {
  LlmParameterSchemaNode,
  LlmParameterSchemaRoot,
  ParameterPayloadGuide,
  ParameterPayloadQueryFilter,
  ParameterPayloadSummary,
} from '../../../core'

export const SPARK_COMPONENT_PAYLOAD_REF = 'spark.component'

export const SPARK_COMPONENT_PAYLOAD_DESCRIPTION = 'SparkNode 组件参数荷载目录；key 为组件 type，如 r-table。'

const COMPONENT_CATALOG_JSON = projectFrameworkNeutralCatalog(rawComponentCatalogJson as ComponentCatalog)

const PAGE_DESIGN_FUNCTION_CATALOG = projectFunctionCatalog(COMPONENT_CATALOG_JSON)

interface ComponentPropGuide {
  name: string
  type: string
  default?: string
  description?: string
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

function inferParamSchemaFromTypeText(prop: ComponentPropGuide): LlmParameterSchemaNode {
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
        properties: propsProperties,
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
    minimalParams: guide.minimalConfig,
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
