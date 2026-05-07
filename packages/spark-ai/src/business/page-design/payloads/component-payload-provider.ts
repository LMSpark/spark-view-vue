import componentCatalogJson from '../../../catalog/component-catalog.json'
import type { ComponentCatalog } from '../../../catalog/types'
import { projectComponentConfigGuide, projectFunctionCatalog } from '../../../catalog/catalog-projections'
import {
  KnowledgePayloadRegistry,
  type KnowledgePayloadGuide,
  type KnowledgePayloadProvider,
  type KnowledgePayloadQueryFilter,
  type KnowledgePayloadSummary,
} from '../../../core'

const PAGE_DESIGN_COMPONENT_PAYLOAD_REF = 'page-design.component'

const PAGE_DESIGN_FUNCTION_CATALOG = projectFunctionCatalog(componentCatalogJson as ComponentCatalog)

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

function inferJsonSchemaFromTypeText(typeText: string): Record<string, unknown> {
  const normalized = typeText.trim().toLowerCase()
  const enumValues = parseLiteralUnion(typeText)
  if (enumValues.length > 0) {
    return { type: 'string', enum: enumValues }
  }

  if (normalized.includes('boolean')) return { type: 'boolean' }
  if (normalized.includes('number') || normalized.includes('integer') || normalized.includes('float')) return { type: 'number' }
  if (normalized.includes('array') || normalized.includes('[]')) return { type: 'array', items: { type: 'object' } }
  if (normalized.includes('record') || normalized.includes('object') || normalized.includes('{')) return { type: 'object' }
  return { type: 'string' }
}

function normalizeFilter(filter: KnowledgePayloadQueryFilter | undefined): KnowledgePayloadQueryFilter {
  if (filter === undefined) return {}
  if (filter['category'] !== undefined && typeof filter['category'] !== 'string') {
    throw new Error('page-design.component filter.category 必须是字符串')
  }
  if (filter['keyword'] !== undefined && typeof filter['keyword'] !== 'string') {
    throw new Error('page-design.component filter.keyword 必须是字符串')
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

function matchesFilter(summary: KnowledgePayloadSummary, filter: KnowledgePayloadQueryFilter): boolean {
  if (filter.category !== undefined && summary.category !== filter.category) return false
  if (filter.keyword !== undefined) {
    const haystack = `${summary.key} ${summary.description} ${summary.tags?.join(' ') ?? ''}`.toLowerCase()
    return haystack.includes(filter.keyword)
  }
  return true
}

function propSchema(prop: ComponentPropGuide): Record<string, unknown> {
  return {
    ...inferJsonSchemaFromTypeText(prop.type),
    ...(prop.description !== undefined ? { description: prop.description } : {}),
    ...(prop.default !== undefined ? { default: prop.default } : {}),
  }
}

function buildSparkNodeJsonSchema(type: string, requiredProps: ComponentPropGuide[], optionalProps: ComponentPropGuide[]): Record<string, unknown> {
  const propsProperties: Record<string, unknown> = {}
  for (const prop of [...requiredProps, ...optionalProps]) {
    propsProperties[prop.name] = propSchema(prop)
  }

  return {
    type: 'object',
    required: ['type', 'props'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'SparkNode 稳定 id；新增节点时可省略，由宿主生成。' },
      type: { const: type, description: 'Spark 组件 type，必须与 payload key 完全一致。' },
      props: {
        type: 'object',
        required: requiredProps.map(prop => prop.name),
        additionalProperties: true,
        properties: propsProperties,
      },
      children: {
        type: 'array',
        items: { type: 'object' },
        description: '子 SparkNode 列表；是否允许子节点以组件 nestingRule 和函数指南为准。',
      },
    },
  }
}

function buildPayloadGuide(type: string): KnowledgePayloadGuide | null {
  const guide = projectComponentConfigGuide(componentCatalogJson as ComponentCatalog, type)
  if (guide === null) return null

  return {
    payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
    key: guide.type,
    description: `${guide.type} SparkNode 参数荷载指南`,
    jsonSchema: buildSparkNodeJsonSchema(guide.type, guide.requiredProps, guide.optionalProps),
    minimalExample: guide.minimalConfig,
    usageRules: [
      '构造 pageDesign@nodeTree@* 的 node 参数前，必须以本 JSON Schema 为准。',
      'required props 必须显式传入；default 只能作为默认值提示，不能代替业务值判断。',
      '事件绑定只能使用 eventGuide / emits 中声明的事件名。',
      ...guide.failFastChecks,
    ],
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: 'key 不存在于 page-design.component 参数荷载目录。',
        fix: '先调用 core@knowledge@queryPayloads({ payloadRef:"page-design.component" }) 重新选择可用组件。',
      },
    ],
  }
}

export class PageDesignComponentPayloadProvider implements KnowledgePayloadProvider {
  static readonly payloadRef = PAGE_DESIGN_COMPONENT_PAYLOAD_REF

  readonly payloadRef = PAGE_DESIGN_COMPONENT_PAYLOAD_REF

  readonly description = 'Page Design SparkNode 组件参数荷载目录；key 为组件 type，如 r-table。'

  queryPayloads(filter?: KnowledgePayloadQueryFilter): KnowledgePayloadSummary[] {
    const normalizedFilter = normalizeFilter(filter)
    return Object.entries(PAGE_DESIGN_FUNCTION_CATALOG.components)
      .map(([key, entry]) => ({
        payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
        key,
        category: entry.category,
        description: entry.description,
        tags: [entry.category],
      }))
      .filter(summary => matchesFilter(summary, normalizedFilter))
      .sort((left, right) => left.key.localeCompare(right.key))
  }

  guidePayload(key: string): KnowledgePayloadGuide | null {
    const normalizedKey = key.trim()
    if (normalizedKey.length === 0) return null
    return buildPayloadGuide(normalizedKey)
  }

  register(): void {
    KnowledgePayloadRegistry.register(this)
  }
}