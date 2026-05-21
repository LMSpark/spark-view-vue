/**
 * 页面设计组件荷载目录工具模块。
 *
 * 提供 payload-catalog 的两个动作：
 * - queryPayloads — 查询组件荷载摘要
 * - guidePayload — 查询单个组件的完整 props paramsSchema
 */

import type { ActionFailureMode, ActionSchema } from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonSchema, LlmJsonValue, LlmParameterSchemaRoot } from '@spark-view/spark-ai/schema'
import {
  pageDesignServiceFailure,
  type PageDesignServiceResult,
} from '../../../../page/workspace/services/page-design-service'
import componentCatalogPayload from '../payloads/component-catalog.json'

export interface PayloadCatalogFunctionFailureMode extends ActionFailureMode {}
export type PayloadCatalogFunctionId = 'queryPayloads' | 'guidePayload'
export type PayloadCatalogActionRunner = (args: Readonly<Record<string, LlmJsonValue>>) => PageDesignServiceResult<unknown>

interface PageDesignPayloadProp {
  readonly name: string
  readonly type?: string | undefined
  readonly required?: boolean | undefined
  readonly description?: string | undefined
  readonly schema?: LlmJsonSchema | undefined
}

interface PageDesignPayloadEntry {
  readonly type: string
  readonly filePath?: string | undefined
  readonly category?: string | undefined
  readonly description?: string | undefined
  readonly internal?: boolean | undefined
  readonly configurable?: boolean | undefined
  readonly props?: readonly PageDesignPayloadProp[] | undefined
  readonly emits?: readonly unknown[] | undefined
  readonly source?: string | undefined
}

interface PageDesignPayloadCatalog {
  readonly version: string
  readonly componentCount: number
  readonly components: Readonly<Record<string, PageDesignPayloadEntry>>
}

const PAGE_DESIGN_COMPONENT_CATALOG: PageDesignPayloadCatalog = readPageDesignPayloadCatalog(componentCatalogPayload)

export const PAYLOAD_CATALOG_ACTIONS: readonly ActionSchema[] = [
  {
    name: 'queryPayloads',
    description: '查询可用于当前页面设计的组件参数荷载目录，支持 category/keyword/key 过滤。',
    paramsSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '按组件 category 精确过滤，例如 container、field、display。' },
        keyword: { type: 'string', description: '按 type、category、description 或 filePath 模糊搜索。' },
        key: { type: 'string', description: '按组件 type/key 精确查询。' },
        configurableOnly: { type: 'boolean', description: '为 true 时仅返回 configurable=true 且 internal=false 的组件。' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: '最多返回条数，默认 20。' },
      },
      additionalProperties: false,
    },
    resultSchema: {
      items: 'PageDesignPayloadSummary[] — 组件荷载摘要，包含 key/type/category/description/requiredProps。',
    },
    example: { category: 'container', limit: 10 },
    usageRules: [
      '新增或替换 SparkNode 前先查询候选组件。',
      '拿到目标 key 后再调用 guidePayload 获取完整 paramsSchema。',
    ],
    failureModes: [],
  },
  {
    name: 'guidePayload',
    description: '查询单个组件 type/key 的参数荷载指南，用于构造合法 SparkNode props。',
    paramsSchema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: { type: 'string', minLength: 1, description: '组件 type/key，例如 renderer-button。' },
      },
      additionalProperties: false,
    },
    resultSchema: {
      payload: 'PageDesignPayloadGuide — 组件完整荷载指南，包含 props 与 paramsSchema。',
    },
    example: { key: 'renderer-button' },
    usageRules: [
      '构造 node.props 前必须按目标组件 key 查询指南。',
      '如果返回 PAYLOAD_NOT_FOUND，先 queryPayloads 选择替代组件，不要猜 props。',
    ],
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: 'key 不存在于组件荷载目录。',
        fix: '先调用 queryPayloads 按 category 或 keyword 选择可用组件。',
      },
    ],
  },
]

export const PAYLOAD_CATALOG_ACTION_RUNNERS: Readonly<Record<PayloadCatalogFunctionId, PayloadCatalogActionRunner>> = {
  queryPayloads: queryPageDesignPayloads,
  guidePayload: guidePageDesignPayload,
}

export function runPayloadCatalogAction(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): PageDesignServiceResult<unknown> {
  if (isPayloadCatalogFunctionId(actionName)) {
    return PAYLOAD_CATALOG_ACTION_RUNNERS[actionName](args)
  }
  return pageDesignServiceFailure(
    'UNKNOWN_ACTION',
    `payload-catalog 不支持动作 "${actionName}"`,
    '请先调用 describeKind("payload-catalog") 查看动作表。',
  )
}

export function isPayloadCatalogFunctionId(value: string): value is PayloadCatalogFunctionId {
  return value === 'queryPayloads' || value === 'guidePayload'
}

function queryPageDesignPayloads(args: Readonly<Record<string, LlmJsonValue>>): PageDesignServiceResult<unknown> {
  const category = typeof args['category'] === 'string' ? args['category'].trim() : ''
  const keyword = typeof args['keyword'] === 'string' ? args['keyword'].trim() : ''
  const key = typeof args['key'] === 'string' ? args['key'].trim() : ''
  const configurableOnly = args['configurableOnly'] === true
  const limit = payloadLimit(args)

  let rows = payloadRows()
  if (category.length > 0) {
    rows = rows.filter((entry) => entry.category === category)
  }
  if (keyword.length > 0) {
    rows = rows.filter((entry) => payloadMatchesKeyword(entry, keyword))
  }
  if (key.length > 0) {
    rows = rows.filter((entry) => payloadKey(entry) === key || entry.type === key)
  }
  if (configurableOnly) {
    rows = rows.filter((entry) => entry.configurable === true && entry.internal !== true)
  }

  const items = rows.slice(0, limit).map((entry) => summarizePayload(entry))
  return {
    ok: true,
    data: {
      version: PAGE_DESIGN_COMPONENT_CATALOG.version,
      total: rows.length,
      items,
    },
    summary: `已返回 ${items.length}/${rows.length} 个组件荷载摘要`,
  }
}

function guidePageDesignPayload(args: Readonly<Record<string, LlmJsonValue>>): PageDesignServiceResult<unknown> {
  const key = typeof args['key'] === 'string' ? args['key'].trim() : ''
  if (key.length === 0) {
    return pageDesignServiceFailure('INVALID_PAYLOAD_KEY', 'guidePayload requires a non-empty key', '传入 { key: "component-type" }。')
  }
  const entry = findPayloadEntry(key)
  if (entry === null) {
    return pageDesignServiceFailure('PAYLOAD_NOT_FOUND', `组件荷载 "${key}" 不存在`, '先调用 queryPayloads 按 category 或 keyword 选择可用组件。')
  }
  return {
    ok: true,
    data: {
      payload: {
        ...summarizePayload(entry),
        props: entry.props ?? [],
        emits: entry.emits ?? [],
        paramsSchema: createPayloadParamsSchema(entry),
      },
    },
    summary: `${key} 组件荷载指南已返回`,
  }
}

function payloadRows(): PageDesignPayloadEntry[] {
  return Object.values(PAGE_DESIGN_COMPONENT_CATALOG.components)
}

function payloadKey(entry: PageDesignPayloadEntry): string {
  return entry.type
}

function payloadMatchesKeyword(entry: PageDesignPayloadEntry, keyword: string): boolean {
  const haystack = [
    entry.type,
    entry.category ?? '',
    entry.description ?? '',
    entry.filePath ?? '',
  ].join('\n').toLowerCase()
  return haystack.includes(keyword.toLowerCase())
}

function payloadLimit(input: Readonly<Record<string, LlmJsonValue>>): number {
  const rawLimit = input['limit']
  if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit)) return 20
  return Math.min(Math.max(rawLimit, 1), 50)
}

function findPayloadEntry(key: string): PageDesignPayloadEntry | null {
  const direct = PAGE_DESIGN_COMPONENT_CATALOG.components[key]
  if (direct !== undefined) return direct
  return payloadRows().find((entry) => entry.type === key) ?? null
}

function summarizePayload(entry: PageDesignPayloadEntry): Record<string, unknown> {
  const props = entry.props ?? []
  const requiredProps = props.filter((prop) => prop.required === true).map((prop) => prop.name)
  return {
    key: payloadKey(entry),
    type: entry.type,
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.filePath === undefined ? {} : { filePath: entry.filePath }),
    configurable: entry.configurable === true,
    internal: entry.internal === true,
    propCount: props.length,
    ...(requiredProps.length === 0 ? {} : { requiredProps }),
  }
}

function createPayloadParamsSchema(entry: PageDesignPayloadEntry): LlmParameterSchemaRoot {
  const properties: Record<string, LlmJsonSchema> = {}
  const required: string[] = []
  for (const prop of entry.props ?? []) {
    properties[prop.name] = prop.schema ?? {
      type: 'string',
      ...(prop.description === undefined ? {} : { description: prop.description }),
    }
    if (prop.required === true) required.push(prop.name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: true,
  }
}

function readPageDesignPayloadCatalog(value: unknown): PageDesignPayloadCatalog {
  if (!isRecord(value) || typeof value['version'] !== 'string' || typeof value['componentCount'] !== 'number' || !isRecord(value['components'])) {
    throw new Error('PageDesign component payload catalog is invalid')
  }
  const components: Record<string, PageDesignPayloadEntry> = {}
  for (const [key, entry] of Object.entries(value['components'])) {
    if (!isPageDesignPayloadEntry(entry)) {
      throw new Error(`PageDesign component payload catalog entry is invalid: ${key}`)
    }
    components[key] = entry
  }
  return {
    version: value['version'],
    componentCount: value['componentCount'],
    components,
  }
}

function isPageDesignPayloadEntry(value: unknown): value is PageDesignPayloadEntry {
  return isRecord(value)
    && typeof value['type'] === 'string'
    && isOptionalString(value['filePath'])
    && isOptionalString(value['category'])
    && isOptionalString(value['description'])
    && isOptionalBoolean(value['internal'])
    && isOptionalBoolean(value['configurable'])
    && (value['props'] === undefined || (Array.isArray(value['props']) && value['props'].every(isPageDesignPayloadProp)))
    && (value['emits'] === undefined || Array.isArray(value['emits']))
    && isOptionalString(value['source'])
}

function isPageDesignPayloadProp(value: unknown): value is PageDesignPayloadProp {
  return isRecord(value)
    && typeof value['name'] === 'string'
    && isOptionalString(value['type'])
    && isOptionalBoolean(value['required'])
    && isOptionalString(value['description'])
    && (value['schema'] === undefined || isLlmJsonSchema(value['schema']))
}

function isLlmJsonSchema(value: unknown): value is LlmJsonSchema {
  return typeof value === 'boolean' || isRecord(value)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
