/**
 * 页面设计参数荷载目录工具模块。
 *
 * 本文件按功能顺序承载组件 payload 目录：构建产物读取、
 * provider registry、LLM 工具动作、guide 记录和 paramsSchema 投影。
 */

import {
  ModuleKind,
  ModuleParameterPayloadRegistry,
  type ModuleActionMetadata,
  type ModuleInstanceRef,
  type ModuleOperationResult,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import type {
  ModuleParameterPayloadGuide,
  ModuleParameterPayloadProvider,
  ModuleParameterPayloadQueryFilter,
  ModuleParameterPayloadSummary,
} from '@spark-view/spark-ai'
import type { LlmJsonSchema, LlmJsonValue, LlmJsonSchemaObject } from '@spark-view/spark-ai/schema'
import { isRecord } from '../json-document'
import type { PageDesignServiceContext } from '../design/page-design-host-api'
import type { PageDesignServiceResult } from '../design/page-design-session-api'
import { PageDesignService } from '../design/page-design-service'
import componentCatalogPayload from './payloads/component-catalog.json'
import { createCurrentPageRef } from './page-design-helpers'
import {
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_NODE_TREE_KIND,
  PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
} from './page-design-kind-ids'

type PayloadCatalogFunctionId = 'queryPayloads' | 'guidePayload'
type PayloadCatalogActionRunner = (
  registry: ModuleParameterPayloadRegistry,
  args: Readonly<Record<string, LlmJsonValue>>,
) => PageDesignServiceResult<unknown>

type PageDesignPayloadProp = {
  readonly name: string
  readonly type?: string | undefined
  readonly required?: boolean | undefined
  readonly description?: string | undefined
  readonly schema?: LlmJsonSchema | undefined
}

type PageDesignPayloadEntry = {
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

type PageDesignPayloadCatalog = {
  readonly version: string
  readonly componentCount: number
  readonly components: Readonly<Record<string, PageDesignPayloadEntry>>
  readonly $defs?: Readonly<Record<string, LlmJsonSchema>> | undefined
}

// ── 构建产物读取与推荐排序 ─────────────────────────────────

// PAGE_DESIGN_REFACTOR_SOURCE[payload-catalog-data]: VCM 构建产物只在工具内部做按需查询；不要把完整 catalog 拼进 LLM prompt。
const PAGE_DESIGN_COMPONENT_CATALOG: PageDesignPayloadCatalog = readPageDesignPayloadCatalog(componentCatalogPayload)
const RECOMMENDED_PAYLOAD_ORDER = [
  'r-section',
  'r-form',
  'r-table',
  'r-list',
  'r-button',
  'r-card',
  'r-text',
  'r-select',
  'r-date',
  'r-number',
  'r-textarea',
  'r-radio',
  'r-checkbox',
  'r-switch',
]
const RECOMMENDED_PAYLOAD_RANK = new Map(RECOMMENDED_PAYLOAD_ORDER.map((key, index) => [key, index]))

// ── LLM 动作声明 ──────────────────────────────────────────

const PAYLOAD_CATALOG_ACTIONS: readonly ModuleActionMetadata[] = [
  {
    name: 'queryPayloads',
    description: '查询可用于当前页面设计的组件参数荷载目录，支持 category/keyword/key 过滤。',
    paramsSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '按组件 category 精确过滤，例如 container、field、display。' },
        keyword: { type: 'string', description: '按 type、category、description 或 filePath 模糊搜索。' },
        key: { type: 'string', description: '按组件 type/key 精确查询。' },
        moduleKind: { type: 'string', description: '参数所属 ModuleKind。默认 node-tree，因为组件 props 用于构造 node-tree 写入动作的 SparkNode 参数。' },
        payloadRef: { type: 'string', description: '参数 provider 命名空间。默认 spark.component。' },
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
      '组件参数目录注册在 node-tree 模块下；不确定 provider 时先 queryPayloads，不要假设 payloadRef。',
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
        moduleKind: { type: 'string', description: '参数所属 ModuleKind。默认 node-tree。' },
        payloadRef: { type: 'string', description: '参数 provider 命名空间。默认 spark.component。' },
      },
      additionalProperties: false,
    },
    resultSchema: {
      payload: 'PageDesignPayloadGuide — 组件完整荷载指南，包含 props 与 paramsSchema。',
    },
    example: { key: 'renderer-button' },
    usageRules: [
      '构造 node.props 前必须按目标组件 key 查询指南。',
      'guidePayload 通过 moduleKind + payloadRef 定位参数 provider；默认读取 node-tree/spark.component。',
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

const PAYLOAD_CATALOG_ACTION_RUNNERS: Readonly<Record<PayloadCatalogFunctionId, PayloadCatalogActionRunner>> = {
  queryPayloads: queryPageDesignPayloads,
  guidePayload: guidePageDesignPayload,
}

// ── Provider 注册入口 ─────────────────────────────────────

/**
 * 创建 pageDesign 的参数荷载 provider registry。
 *
 * registry 只注册 node-tree/spark.component 这一类组件 props 知识；其它业务知识应通过
 * 对应 ModuleKind 暴露，不要塞进组件目录。
 */
export function createPageDesignPayloadRegistry(): ModuleParameterPayloadRegistry {
  const registry = new ModuleParameterPayloadRegistry()
  registry.register(createPageDesignComponentPayloadProvider())
  return registry
}

// PAGE_DESIGN_AI_TRACE[page-design-payload-provider]: pageDesign AI 的组件参数荷载指南出处；node-tree 写 props 前应以这里的 guidePayload/paramsSchema 为准。
// PAGE_DESIGN_REFACTOR_SOURCE[payload-guide-gate]: 组件 props 知识进入 LLM 的唯一业务工具门；queryPayloads/guidePayload 返回多少，LLM 才知道多少。
/**
 * 创建组件 props 参数荷载 provider。
 *
 * query 只返回摘要，guide 才返回完整 paramsSchema；这个分层保证 LLM 按需建立知识，
 * 也避免把 VCM 构建产物整体灌入上下文。
 */
function createPageDesignComponentPayloadProvider(): ModuleParameterPayloadProvider {
  return {
    moduleKind: PAGE_DESIGN_NODE_TREE_KIND,
    payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
    description: 'SparkNode 组件 props 参数目录；服务 node-tree 的 addNode/addNodes/replaceNode/replaceNodes 写入动作。',
    queryPayloads: queryPageDesignComponentPayloads,
    guidePayload: guidePageDesignComponentPayload,
  }
}

// ── payload-catalog ModuleKind ────────────────────────────

/**
 * 参数荷载目录子模块。
 *
 * 本模块负责把 `queryPayloads/guidePayload` 暴露给 LLM，并在 guide 成功后通知
 * `PageDesignService` 记录当前会话已显式获取的组件指南。
 */
export class PageDesignPayloadCatalogModuleKind extends ModuleKind {
  private readonly registry: ModuleParameterPayloadRegistry
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext
    readonly parentKind?: string | undefined
    readonly registry?: ModuleParameterPayloadRegistry | undefined
  }) {
    super({
      kind: PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
      name: 'Page Design Payload Catalog',
      description: '当前页面设计参数荷载知识查询，按 moduleKind + payloadRef 路由到已注册 provider。',
      parentKind: options.parentKind,
      actions: PAYLOAD_CATALOG_ACTIONS,
      children: [],
    })
    this.registry = options.registry ?? createPageDesignPayloadRegistry()
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  protected override runAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    if (this.findAction(actionName) === undefined) {
      throw new Error(`${this.kind} action is not declared: ${actionName}`)
    }
    const result = runPayloadCatalogAction(this.registry, actionName, args)
    if (result.ok && actionName === 'guidePayload') {
      this.recordGuidedPayload(ctx, args, result.data)
    }
    return Promise.resolve(this.serviceResultToOperationResult(result))
  }

  protected override createCurrentInstanceRef(ctx: ModulePathContext): ModuleInstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面组件荷载目录')
  }

  private recordGuidedPayload(
    ctx: ModulePathContext,
    args: Readonly<Record<string, LlmJsonValue>>,
    data: unknown,
  ): void {
    if (!isRecord(data)) return
    const moduleKind = typeof data['moduleKind'] === 'string' ? data['moduleKind'] : ''
    const payloadRef = typeof data['payloadRef'] === 'string' ? data['payloadRef'] : ''
    const key = typeof args['key'] === 'string' ? args['key'].trim() : ''
    if (moduleKind !== PAGE_DESIGN_NODE_TREE_KIND || payloadRef !== PAGE_DESIGN_COMPONENT_PAYLOAD_REF || key.length === 0) {
      return
    }
    const payload = data['payload']
    if (!isModuleParameterPayloadGuide(payload)) return
    this.service.recordNodePayloadGuide(this.contextFactory(ctx), key, payload)
  }
}

// ── Action 路由 ───────────────────────────────────────────

function isModuleParameterPayloadGuide(value: unknown): value is ModuleParameterPayloadGuide {
  return isRecord(value)
    && typeof value['moduleKind'] === 'string'
    && typeof value['payloadRef'] === 'string'
    && typeof value['key'] === 'string'
    && isRecord(value['paramsSchema'])
}

function runPayloadCatalogAction(
  registry: ModuleParameterPayloadRegistry,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): PageDesignServiceResult<unknown> {
  if (isPayloadCatalogFunctionId(actionName)) {
    return PAYLOAD_CATALOG_ACTION_RUNNERS[actionName](registry, args)
  }
  return PageDesignService.failure(
    'UNKNOWN_ACTION',
    `payload-catalog 不支持动作 "${actionName}"`,
    '请先调用 describeKind("payload-catalog") 查看动作表。',
  )
}

function isPayloadCatalogFunctionId(value: string): value is PayloadCatalogFunctionId {
  return value === 'queryPayloads' || value === 'guidePayload'
}

// ── 查询与 guide 执行 ─────────────────────────────────────

function queryPageDesignPayloads(
  registry: ModuleParameterPayloadRegistry,
  args: Readonly<Record<string, LlmJsonValue>>,
): PageDesignServiceResult<unknown> {
  const provider = resolvePayloadProvider(registry, args)
  if (!provider.ok) return provider
  const filter = createPayloadQueryFilter(args, provider.data.moduleKind, provider.data.payloadRef)
  const items = provider.data.provider.queryPayloads(filter)
  return {
    ok: true,
    data: {
      moduleKind: provider.data.moduleKind,
      payloadRef: provider.data.payloadRef,
      provider: {
        moduleKind: provider.data.provider.moduleKind,
        payloadRef: provider.data.provider.payloadRef,
        description: provider.data.provider.description,
      },
      total: items.length,
      items,
    },
    summary: `已从 ${provider.data.moduleKind}/${provider.data.payloadRef} 返回 ${items.length} 个参数荷载摘要`,
  }
}

function guidePageDesignPayload(
  registry: ModuleParameterPayloadRegistry,
  args: Readonly<Record<string, LlmJsonValue>>,
): PageDesignServiceResult<unknown> {
  const key = typeof args['key'] === 'string' ? args['key'].trim() : ''
  if (key.length === 0) {
    return PageDesignService.failure('INVALID_PAYLOAD_KEY', 'guidePayload requires a non-empty key', '传入 { key: "component-type" }。')
  }
  const provider = resolvePayloadProvider(registry, args)
  if (!provider.ok) return provider
  const guide = provider.data.provider.guidePayload(key)
  if (guide === null) {
    return PageDesignService.failure('PAYLOAD_NOT_FOUND', `参数荷载 "${key}" 不存在`, '先调用 queryPayloads 按 moduleKind/payloadRef/category 或 keyword 选择可用条目。')
  }
  return {
    ok: true,
    data: {
      moduleKind: provider.data.moduleKind,
      payloadRef: provider.data.payloadRef,
      payload: guide,
    },
    summary: `${provider.data.moduleKind}/${provider.data.payloadRef}/${key} 参数荷载指南已返回`,
  }
}

// ── 组件目录查询与 guide 投影 ─────────────────────────────

function queryPageDesignComponentPayloads(filter: ModuleParameterPayloadQueryFilter = {}): ModuleParameterPayloadSummary[] {
  const category = typeof filter.category === 'string' ? filter.category.trim() : ''
  const keyword = typeof filter.keyword === 'string' ? filter.keyword.trim() : ''
  const key = typeof filter.key === 'string' ? filter.key.trim() : ''
  const configurableOnly = filter.configurableOnly === true
  const limit = payloadLimit(filter)

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
    rows = rows.filter(isConfigurablePayload)
  }

  return [...rows]
    .sort(comparePayloadEntries)
    .slice(0, limit)
    .map((entry) => summarizePayload(entry))
}

// ── Action 参数归一化与 provider 定位 ─────────────────────

function createPayloadQueryFilter(
  args: Readonly<Record<string, LlmJsonValue>>,
  moduleKind: string,
  payloadRef: string,
): Parameters<ModuleParameterPayloadProvider['queryPayloads']>[0] {
  const category = typeof args['category'] === 'string' ? args['category'].trim() : undefined
  const keyword = typeof args['keyword'] === 'string' ? args['keyword'].trim() : undefined
  const key = typeof args['key'] === 'string' ? args['key'].trim() : undefined
  const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined
  return {
    moduleKind,
    payloadRef,
    ...(category === undefined || category.length === 0 ? {} : { category }),
    ...(keyword === undefined || keyword.length === 0 ? {} : { keyword }),
    ...(key === undefined || key.length === 0 ? {} : { key }),
    ...(args['configurableOnly'] === true ? { configurableOnly: true } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
}

function resolvePayloadProvider(
  registry: ModuleParameterPayloadRegistry,
  args: Readonly<Record<string, LlmJsonValue>>,
): PageDesignServiceResult<{
  readonly moduleKind: string
  readonly payloadRef: string
  readonly provider: ModuleParameterPayloadProvider
}> {
  const moduleKind = typeof args['moduleKind'] === 'string' && args['moduleKind'].trim().length > 0
    ? args['moduleKind'].trim()
    : PAGE_DESIGN_NODE_TREE_KIND
  const payloadRef = typeof args['payloadRef'] === 'string' && args['payloadRef'].trim().length > 0
    ? args['payloadRef'].trim()
    : PAGE_DESIGN_COMPONENT_PAYLOAD_REF
  const provider = registry.getProvider(moduleKind, payloadRef)
  if (provider === undefined) {
    return PageDesignService.failure(
      'PAYLOAD_PROVIDER_NOT_REGISTERED',
      `参数荷载 provider 未注册: ${moduleKind}/${payloadRef}`,
      '先调用 queryPayloads 不带 moduleKind/payloadRef 使用默认 provider，或确认目标模块已注册对应参数目录。',
    )
  }
  return {
    ok: true,
    data: { moduleKind, payloadRef, provider },
    summary: `已定位参数荷载 provider: ${moduleKind}/${payloadRef}`,
  }
}

function guidePageDesignComponentPayload(key: string): ModuleParameterPayloadGuide | null {
  const entry = findPayloadEntry(key)
  if (entry === null || !isWritablePageDesignComponentPayload(entry)) {
    return null
  }
  return {
    ...summarizePayload(entry),
    description: `${entry.type} SparkNode props 参数荷载指南`,
    props: entry.props ?? [],
    emits: entry.emits ?? [],
    paramsSchema: createPayloadParamsSchema(entry),
    usageRules: [
      '构造 node-tree 写动作的 node.props 前，必须以 paramsSchema.properties 为准。',
      'required props 必须显式传入；description/default 只能作为提示，不能代替业务判断。',
      '未知 props 不要猜；缺少组件 key 时先调用 queryPayloads。',
    ],
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: `key 不存在于 ${PAGE_DESIGN_COMPONENT_PAYLOAD_REF} 参数荷载目录。`,
        fix: '先调用 queryPayloads 按 category 或 keyword 选择可用组件。',
      },
    ],
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

function payloadLimit(input: ModuleParameterPayloadQueryFilter): number {
  const rawLimit = input.limit
  if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit)) return 20
  return Math.min(Math.max(rawLimit, 1), 50)
}

function findPayloadEntry(key: string): PageDesignPayloadEntry | null {
  const direct = PAGE_DESIGN_COMPONENT_CATALOG.components[key]
  if (direct !== undefined) return direct
  return payloadRows().find((entry) => entry.type === key) ?? null
}

export function hasPageDesignComponentPayloadKey(key: string): boolean {
  return findPayloadEntry(key.trim()) !== null
}

export function isPageDesignWritableComponentPayloadKey(key: string): boolean {
  const entry = findPayloadEntry(key.trim())
  return entry !== null && isWritablePageDesignComponentPayload(entry)
}

export function getPageDesignComponentPayloadGuide(key: string): ModuleParameterPayloadGuide | null {
  return guidePageDesignComponentPayload(key.trim())
}

// ── paramsSchema 生成 ─────────────────────────────────────

function summarizePayload(entry: PageDesignPayloadEntry): ModuleParameterPayloadSummary {
  const props = entry.props ?? []
  const requiredProps = props.filter((prop) => prop.required === true).map((prop) => prop.name)
  return {
    moduleKind: PAGE_DESIGN_NODE_TREE_KIND,
    payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
    key: payloadKey(entry),
    type: entry.type,
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.filePath === undefined ? {} : { filePath: entry.filePath }),
    configurable: isConfigurablePayload(entry),
    internal: entry.internal === true,
    propCount: props.length,
    ...(requiredProps.length === 0 ? {} : { requiredProps }),
    ...(isRecommendedPayload(entry) ? { tags: ['recommended'] } : {}),
  }
}

function comparePayloadEntries(left: PageDesignPayloadEntry, right: PageDesignPayloadEntry): number {
  const leftRank = payloadRank(left)
  const rightRank = payloadRank(right)
  if (leftRank !== rightRank) return leftRank - rightRank
  return left.type.localeCompare(right.type)
}

function payloadRank(entry: PageDesignPayloadEntry): number {
  const recommendedRank = RECOMMENDED_PAYLOAD_RANK.get(entry.type)
  if (recommendedRank !== undefined) return recommendedRank
  return RECOMMENDED_PAYLOAD_ORDER.length
}

function isRecommendedPayload(entry: PageDesignPayloadEntry): boolean {
  return RECOMMENDED_PAYLOAD_RANK.has(entry.type)
}

function isConfigurablePayload(entry: PageDesignPayloadEntry): boolean {
  return entry.internal !== true && entry.configurable !== false
}

function isWritablePageDesignComponentPayload(entry: PageDesignPayloadEntry): boolean {
  return entry.type.trim().length > 0
}

function createPayloadParamsSchema(entry: PageDesignPayloadEntry): LlmJsonSchemaObject {
  const properties: Record<string, LlmJsonSchema> = {}
  const required: string[] = []
  for (const prop of entry.props ?? []) {
    properties[prop.name] = createPayloadPropSchema(prop)
    if (prop.required === true) required.push(prop.name)
  }
  const reachableDefs = collectReachableDefs(Object.values(properties), PAGE_DESIGN_COMPONENT_CATALOG.$defs ?? {})
  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
    ...(Object.keys(reachableDefs).length === 0 ? {} : { $defs: reachableDefs }),
    additionalProperties: true,
  }
}

function createPayloadPropSchema(prop: PageDesignPayloadProp): LlmJsonSchema {
  if (prop.schema !== undefined) return prop.schema
  return {
    ...inferPayloadPropTypeSchema(prop.type),
    ...(prop.description === undefined ? {} : { description: prop.description }),
  }
}

function inferPayloadPropTypeSchema(typeText: string | undefined): LlmJsonSchemaObject {
  if (typeText === undefined || typeText.trim().length === 0) return {}
  const rawParts = typeText
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== 'undefined')
  const literalValues = rawParts.flatMap(readLiteralTypeValue)
  if (literalValues.length > 0 && literalValues.length === rawParts.length) {
    return { enum: literalValues }
  }
  const types = new Set(rawParts.flatMap((part) => inferJsonSchemaTypes(part)))
  if (types.size === 0) return {}
  const type = [...types].sort()
  if (type.length === 1) return { type: type[0] ?? 'string' }
  return { type }
}

function readLiteralTypeValue(typePart: string): ReadonlyArray<string | number | boolean | null> {
  if ((typePart.startsWith("'") && typePart.endsWith("'")) || (typePart.startsWith('"') && typePart.endsWith('"'))) {
    return [typePart.slice(1, -1)]
  }
  if (typePart === 'true') return [true]
  if (typePart === 'false') return [false]
  if (typePart === 'null') return [null]
  const numeric = Number(typePart)
  return Number.isFinite(numeric) && typePart.trim() !== '' ? [numeric] : []
}

function inferJsonSchemaTypes(typePart: string): ReadonlyArray<'array' | 'boolean' | 'null' | 'number' | 'object' | 'string'> {
  const normalized = typePart.trim().toLowerCase()
  if (normalized === 'string') return ['string']
  if (normalized === 'number') return ['number']
  if (normalized === 'boolean') return ['boolean']
  if (normalized === 'null') return ['null']
  if (normalized === 'object' || normalized.startsWith('record<') || normalized.includes('object>')) return ['object']
  if (normalized === 'array' || normalized.endsWith('[]') || normalized.startsWith('array<') || normalized.startsWith('readonlyarray<')) return ['array']
  return []
}

// ── $defs 裁剪 ────────────────────────────────────────────

function collectReachableDefs(
  roots: readonly LlmJsonSchema[],
  defs: Readonly<Record<string, LlmJsonSchema>>,
): Record<string, LlmJsonSchema> {
  const out: Record<string, LlmJsonSchema> = {}
  const visiting = new Set<string>()

  for (const root of roots) {
    collectSchemaRefs(root, defs, out, visiting)
  }
  return out
}

function collectSchemaRefs(
  schema: LlmJsonSchema | undefined,
  defs: Readonly<Record<string, LlmJsonSchema>>,
  out: Record<string, LlmJsonSchema>,
  visiting: Set<string>,
): void {
  if (schema === undefined || typeof schema !== 'object') return
  const ref = schema['$ref']
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const defKey = decodeURIComponent(ref.slice('#/$defs/'.length))
    if (out[defKey] === undefined) {
      const defSchema = defs[defKey]
      if (defSchema === undefined) {
        throw new Error(`PageDesign component payload catalog missing $defs entry: ${defKey}`)
      }
      out[defKey] = defSchema
    }
    if (!visiting.has(defKey)) {
      visiting.add(defKey)
      collectSchemaRefs(defs[defKey], defs, out, visiting)
      visiting.delete(defKey)
    }
  }

  collectSchemaMapRefs(schema['properties'], defs, out, visiting)
  collectSchemaMapRefs(schema['patternProperties'], defs, out, visiting)
  collectSchemaMapRefs(schema['$defs'], defs, out, visiting)
  collectSchemaArrayRefs(schema['oneOf'], defs, out, visiting)
  collectSchemaArrayRefs(schema['anyOf'], defs, out, visiting)
  collectSchemaArrayRefs(schema['allOf'], defs, out, visiting)
  collectSchemaArrayRefs(schema['prefixItems'], defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['items']) ? schema['items'] : undefined, defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['additionalProperties']) ? schema['additionalProperties'] : undefined, defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['contains']) ? schema['contains'] : undefined, defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['not']) ? schema['not'] : undefined, defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['if']) ? schema['if'] : undefined, defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['then']) ? schema['then'] : undefined, defs, out, visiting)
  collectSchemaRefs(isLlmJsonSchema(schema['else']) ? schema['else'] : undefined, defs, out, visiting)
}

function collectSchemaMapRefs(
  value: unknown,
  defs: Readonly<Record<string, LlmJsonSchema>>,
  out: Record<string, LlmJsonSchema>,
  visiting: Set<string>,
): void {
  if (!isRecord(value)) return
  for (const child of Object.values(value)) {
    collectSchemaRefs(isLlmJsonSchema(child) ? child : undefined, defs, out, visiting)
  }
}

function collectSchemaArrayRefs(
  value: unknown,
  defs: Readonly<Record<string, LlmJsonSchema>>,
  out: Record<string, LlmJsonSchema>,
  visiting: Set<string>,
): void {
  if (!Array.isArray(value)) return
  for (const child of value) {
    collectSchemaRefs(isLlmJsonSchema(child) ? child : undefined, defs, out, visiting)
  }
}

// ── 目录 JSON 运行时校验 ──────────────────────────────────

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
  const defs = readPayloadDefs(value['$defs'])
  return {
    version: value['version'],
    componentCount: value['componentCount'],
    components,
    ...(defs === undefined ? {} : { $defs: defs }),
  }
}

function readPayloadDefs(value: unknown): Readonly<Record<string, LlmJsonSchema>> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error('PageDesign component payload catalog $defs must be an object')
  }
  const defs: Record<string, LlmJsonSchema> = {}
  for (const [key, schema] of Object.entries(value)) {
    if (!isLlmJsonSchema(schema)) {
      throw new Error(`PageDesign component payload catalog $defs entry is invalid: ${key}`)
    }
    defs[key] = schema
  }
  return defs
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
