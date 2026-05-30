/**
 * 页面设计组件参数荷载目录工具模块。
 *
 * ## 在 PageDesign 流程中的位置
 * payload-catalog 是 LLM 的"组件知识库"——node-tree 写入 SparkNode 前，
 * LLM 必须先通过本模块查询目标组件的 props 参数指南，再按 paramsSchema 构造合法 props。
 * ```
 * LLM 想写一个 r-table
 *   → payload-catalog.queryPayloads({ keyword: "table" })   // 获取候选组件摘要
 *   → payload-catalog.guidePayload({ key: "renderer-table" }) // 获取完整 paramsSchema
 *   → node-tree.addNode({ node: { type: "r-table", props: {...} } })
 * ```
 *
 * ## 两层查询设计
 * - `queryPayloads` — 返回目录概要（key/type/category/description/requiredProps），
 *   不包含完整 paramsSchema。LLM 先浏览候选组件，再按需深入。
 * - `guidePayload` — 返回单个组件的具体 paramsSchema + props + emits。
 *   成功调用后自动通知 PageDesignService 记录已查询的组件指南，
 *   供 session diagnostics 事后校验覆盖率。
 *
 * ## Provider 注册
 * 本模块注册一个 provider：moduleKind=node-tree, payloadRef=spark.component。
 * LLM 通过 OpenAI direct function guidePayload({ path, args:{key} }) 查询时，
 * registry 按 moduleKind + payloadRef 路由到正确的 provider；module_call 仅作为旧会话兼容。
 *
 * ## 数据来源
 * 组件目录数据来自 `./payloads/component-catalog.json`（VCM 构建产物），
 * 在 import time 校验结构完整性。推荐排序由 RECOMMENDED_PAYLOAD_ORDER 控制，
 * 优先展示 r-section/r-form/r-table 等高频组件。
 */

import {
  AiModule,
  AiModulePayloadRegistry,
} from '@spark-view/spark-ai/modules'
import type * as SparkAiModules from '@spark-view/spark-ai/modules'
import type { AiJsonSchema, AiJsonValue, AiJsonSchemaObject } from '@spark-view/spark-ai/json'
import {
  booleanSchema,
  paramsSchema,
  stringSchema,
} from '@spark-view/spark-ai/json'
import { isRecord } from '@spark-view/spark-utils'
import type { PageDesignServiceContext } from '../update/page-edit-session'
import type { PageDesignServiceResult } from '../update/page-edit-session'
import { PageDesignService } from '../update/page-design-service'
import componentCatalogPayload from './payloads/component-catalog.json'
import { createCurrentPageRef, findCurrentPageInstance } from './page-design-helpers'
import {
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_NODE_TREE_KIND,
  PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
} from './page-design-kind-ids'

type PayloadCatalogFunctionId = 'queryPayloads' | 'guidePayload'
type AiModuleFunctionMetadata = SparkAiModules.AiModuleFunctionMetadata
type AiModuleInstanceRef = SparkAiModules.AiModuleInstanceRef
type AiModulePathContext = SparkAiModules.AiModulePathContext
type AiModulePayloadGuide = SparkAiModules.AiModulePayloadGuide
type AiModulePayloadProvider = SparkAiModules.AiModulePayloadProvider
type AiModulePayloadQueryFilter = SparkAiModules.AiModulePayloadQueryFilter
type AiModulePayloadSummary = SparkAiModules.AiModulePayloadSummary
type AiModuleResult<T> = SparkAiModules.AiModuleResult<T>
type PayloadCatalogActionRunner = (
  registry: AiModulePayloadRegistry,
  args: Readonly<Record<string, AiJsonValue>>,
) => PageDesignServiceResult<unknown>

type PageDesignPayloadProp = {
  readonly name: string
  readonly type?: string
  readonly required?: boolean
  readonly description?: string
  readonly schema?: AiJsonSchema
}

type PageDesignPayloadEntry = {
  readonly type: string
  readonly filePath?: string
  readonly category?: string
  readonly description?: string
  readonly internal?: boolean
  readonly configurable?: boolean
  readonly props?: readonly PageDesignPayloadProp[]
  readonly emits?: readonly unknown[]
  readonly source?: string
}

type PageDesignPayloadCatalog = {
  readonly version: string
  readonly componentCount: number
  readonly components: Readonly<Record<string, PageDesignPayloadEntry>>
  readonly $defs?: Readonly<Record<string, AiJsonSchema>>
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

const PAYLOAD_CATALOG_ACTIONS: readonly AiModuleFunctionMetadata[] = [
  {
    name: 'queryPayloads',
    description: '查询可用于当前页面设计的组件参数荷载目录，支持 category/keyword/key 过滤。',
    paramsSchema: paramsSchema({
      category: stringSchema('按组件 category 精确过滤，例如 container、field、display。'),
      keyword: stringSchema('按 type、category、description 或 filePath 模糊搜索。'),
      key: stringSchema('按组件 type/key 精确查询。'),
      moduleKind: stringSchema('参数所属 AiModule。默认 node-tree，因为组件 props 用于构造 node-tree 写入动作的 SparkNode 参数。'),
      payloadRef: stringSchema('参数 provider 命名空间。默认 spark.component。'),
      configurableOnly: booleanSchema('为 true 时仅返回 configurable=true 且 internal=false 的组件。'),
      limit: { type: 'integer', minimum: 1, maximum: 50, description: '最多返回条数，默认 20。' },
    }),
    resultSchema: {
      items: 'PageDesignPayloadSummary[] — 组件荷载摘要，包含 key/type/category/description/requiredProps。',
    },
    example: { category: 'container', limit: 10 },
    usageRules: [
      '新增或替换 SparkNode 前先查询候选组件。',
      '组件参数目录注册在 node-tree 模块下；不确定 provider 时先 queryPayloads，不要假设 payloadRef。',
      '拿到目标 key 后再调用 guidePayload 获取具体 paramsSchema。',
    ],
    failureModes: [],
  },
  {
    name: 'guidePayload',
    description: '查询单个组件 type/key 的具体参数荷载指南，用于构造合法 SparkNode props。',
    paramsSchema: paramsSchema({
      key: stringSchema('组件 type/key，例如 renderer-button。', { minLength: 1 }),
      moduleKind: stringSchema('参数所属 AiModule。默认 node-tree。'),
      payloadRef: stringSchema('参数 provider 命名空间。默认 spark.component。'),
    }, ['key']),
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
 * 对应 AiModule 暴露，不要塞进组件目录。
 */
export function createPageDesignPayloadRegistry(): AiModulePayloadRegistry {
  const registry = new AiModulePayloadRegistry()
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
function createPageDesignComponentPayloadProvider(): AiModulePayloadProvider {
  return {
    moduleKind: PAGE_DESIGN_NODE_TREE_KIND,
    payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
    description: 'SparkNode 组件 props 参数目录；服务 node-tree 的 addNode/addNodes/replaceNode/replaceNodes 写入动作。',
    queryPayloads: queryPageDesignComponentPayloads,
    guidePayload: guidePageDesignComponentPayload,
  }
}

// ── payload-catalog AiModule ────────────────────────────

/**
 * 参数荷载目录子模块。
 *
 * 本模块负责把 `queryPayloads/guidePayload` 暴露给 LLM，并在 guide 成功后通知
 * `PageDesignService` 记录当前会话已显式获取的组件指南。
 */
export class PageDesignPayloadCatalogAiModule extends AiModule {
  private readonly registry: AiModulePayloadRegistry
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext
    readonly parentKind?: string
    readonly registry?: AiModulePayloadRegistry
  }) {
    super({
      kind: PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
      name: 'Page Design Payload Catalog',
      description: '当前页面设计参数荷载知识查询，按 moduleKind + payloadRef 路由到已注册 provider。',
      ...(options.parentKind === undefined ? {} : { parentKind: options.parentKind }),
      functions: PAYLOAD_CATALOG_ACTIONS,
      children: [],
      find: (ctx, childKind, query) => findCurrentPageInstance({
        ctx,
        childKind,
        query,
        ownKind: PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
        label: '当前页面组件荷载目录',
      }),
    })
    this.registry = options.registry ?? createPageDesignPayloadRegistry()
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  protected override runFunction(
    ctx: AiModulePathContext,
    actionName: string,
    args: Readonly<Record<string, AiJsonValue>>,
  ): Promise<AiModuleResult<AiJsonValue>> {
    if (this.findFunction(actionName) === undefined) {
      throw new Error(`${this.kind} action is not declared: ${actionName}`)
    }
    const result = runPayloadCatalogAction(this.registry, actionName, args)
    if (result.ok && actionName === 'guidePayload') {
      this.recordGuidedPayload(ctx, args, result.data)
    }
    return Promise.resolve(this.serviceResultToOperationResult(result))
  }

  protected override createCurrentInstanceRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面组件荷载目录')
  }

  private recordGuidedPayload(
    ctx: AiModulePathContext,
    args: Readonly<Record<string, AiJsonValue>>,
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
    if (!isAiModulePayloadGuide(payload)) return
    this.service.recordNodePayloadGuide(this.contextFactory(ctx), key, payload)
  }
}

// ── Action 路由 ───────────────────────────────────────────

function isAiModulePayloadGuide(value: unknown): value is AiModulePayloadGuide {
  return isRecord(value)
    && typeof value['moduleKind'] === 'string'
    && typeof value['payloadRef'] === 'string'
    && typeof value['key'] === 'string'
    && isRecord(value['paramsSchema'])
}

function runPayloadCatalogAction(
  registry: AiModulePayloadRegistry,
  actionName: string,
  args: Readonly<Record<string, AiJsonValue>>,
): PageDesignServiceResult<unknown> {
  if (isPayloadCatalogFunctionId(actionName)) {
    return PAYLOAD_CATALOG_ACTION_RUNNERS[actionName](registry, args)
  }
  return PageDesignService.failure(
    'UNKNOWN_ACTION',
    `payload-catalog 不支持动作 "${actionName}"`,
    '请先调用 module_guide({ kind: "payload-catalog" }) 查看动作表。',
  )
}

function isPayloadCatalogFunctionId(value: string): value is PayloadCatalogFunctionId {
  return value === 'queryPayloads' || value === 'guidePayload'
}

// ── 查询与 guide 执行 ─────────────────────────────────────

function queryPageDesignPayloads(
  registry: AiModulePayloadRegistry,
  args: Readonly<Record<string, AiJsonValue>>,
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
      knowledgeLevel: 'directory',
      directoryFirstRule: 'queryPayloads 只返回目录概要；选定 key 后必须调用 guidePayload 获取具体 props 契约。',
      total: items.length,
      items,
    },
    summary: `已从 ${provider.data.moduleKind}/${provider.data.payloadRef} 返回 ${items.length} 个参数荷载摘要`,
  }
}

function guidePageDesignPayload(
  registry: AiModulePayloadRegistry,
  args: Readonly<Record<string, AiJsonValue>>,
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
      knowledgeLevel: 'detail',
      directoryLookupStep: `queryPayloads({ moduleKind: "${provider.data.moduleKind}", payloadRef: "${provider.data.payloadRef}", key: "${key}" })`,
      payload: guide,
    },
    summary: `${provider.data.moduleKind}/${provider.data.payloadRef}/${key} 参数荷载指南已返回`,
  }
}

// ── 组件目录查询与 guide 投影 ─────────────────────────────

function queryPageDesignComponentPayloads(filter: AiModulePayloadQueryFilter = {}): AiModulePayloadSummary[] {
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
  args: Readonly<Record<string, AiJsonValue>>,
  moduleKind: string,
  payloadRef: string,
): Parameters<AiModulePayloadProvider['queryPayloads']>[0] {
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
  registry: AiModulePayloadRegistry,
  args: Readonly<Record<string, AiJsonValue>>,
): PageDesignServiceResult<{
  readonly moduleKind: string
  readonly payloadRef: string
  readonly provider: AiModulePayloadProvider
}> {
  const moduleKind = typeof args['moduleKind'] === 'string' && args['moduleKind'].trim().length > 0
    ? args['moduleKind'].trim()
    : PAGE_DESIGN_NODE_TREE_KIND
  const payloadRef = typeof args['payloadRef'] === 'string' && args['payloadRef'].trim().length > 0
    ? args['payloadRef'].trim()
    : PAGE_DESIGN_COMPONENT_PAYLOAD_REF
  try {
    const provider = registry.requireProvider(moduleKind, payloadRef)
    return {
      ok: true,
      data: { moduleKind, payloadRef, provider },
      summary: `已定位参数荷载 provider: ${moduleKind}/${payloadRef}`,
    }
  } catch {
    return PageDesignService.failure(
      'PAYLOAD_PROVIDER_NOT_REGISTERED',
      `参数荷载 provider 未注册: ${moduleKind}/${payloadRef}`,
      '先调用 queryPayloads 不带 moduleKind/payloadRef 使用默认 provider，或确认目标模块已注册对应参数目录。',
    )
  }
}

function guidePageDesignComponentPayload(key: string): AiModulePayloadGuide | null {
  const entry = findPayloadEntry(key)
  if (entry === null || !isWritablePageDesignComponentPayload(entry)) {
    return null
  }
  return {
    ...summarizePayload(entry),
    knowledgeLevel: 'detail',
    directoryLookupStep: `queryPayloads({ key: "${payloadKey(entry)}" })`,
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

function payloadLimit(input: AiModulePayloadQueryFilter): number {
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

export function getPageDesignComponentPayloadGuide(key: string): AiModulePayloadGuide | null {
  return guidePageDesignComponentPayload(key.trim())
}

// ── paramsSchema 生成 ─────────────────────────────────────

function summarizePayload(entry: PageDesignPayloadEntry): AiModulePayloadSummary {
  const props = entry.props ?? []
  const requiredProps = props.filter((prop) => prop.required === true).map((prop) => prop.name)
  return {
    knowledgeLevel: 'directory',
    moduleKind: PAGE_DESIGN_NODE_TREE_KIND,
    payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
    key: payloadKey(entry),
    detailLookupStep: `guidePayload({ key: "${payloadKey(entry)}" })`,
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

function createPayloadParamsSchema(entry: PageDesignPayloadEntry): AiJsonSchemaObject {
  const properties: Record<string, AiJsonSchema> = {}
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

function createPayloadPropSchema(prop: PageDesignPayloadProp): AiJsonSchema {
  if (prop.schema !== undefined) return prop.schema
  return {
    ...inferPayloadPropTypeSchema(prop.type),
    ...(prop.description === undefined ? {} : { description: prop.description }),
  }
}

function inferPayloadPropTypeSchema(typeText: string | undefined): AiJsonSchemaObject {
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
  roots: readonly AiJsonSchema[],
  defs: Readonly<Record<string, AiJsonSchema>>,
): Record<string, AiJsonSchema> {
  const out: Record<string, AiJsonSchema> = {}
  const visiting = new Set<string>()
  const collector: SchemaRefCollector = { defs, out, visiting }

  for (const root of roots) {
    collectSchemaRefs(root, collector)
  }
  return out
}

type SchemaRefCollector = Readonly<{
  defs: Readonly<Record<string, AiJsonSchema>>
  out: Record<string, AiJsonSchema>
  visiting: Set<string>
}>

function collectSchemaRefs(
  schema: AiJsonSchema | undefined,
  collector: SchemaRefCollector,
): void {
  const { defs, out, visiting } = collector
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
      collectSchemaRefs(defs[defKey], collector)
      visiting.delete(defKey)
    }
  }

  collectSchemaMapRefs(schema['properties'], collector)
  collectSchemaMapRefs(schema['patternProperties'], collector)
  collectSchemaMapRefs(schema['$defs'], collector)
  collectSchemaArrayRefs(schema['oneOf'], collector)
  collectSchemaArrayRefs(schema['anyOf'], collector)
  collectSchemaArrayRefs(schema['allOf'], collector)
  collectSchemaArrayRefs(schema['prefixItems'], collector)
  collectSchemaRefs(isAiJsonSchema(schema['items']) ? schema['items'] : undefined, collector)
  collectSchemaRefs(isAiJsonSchema(schema['additionalProperties']) ? schema['additionalProperties'] : undefined, collector)
  collectSchemaRefs(isAiJsonSchema(schema['contains']) ? schema['contains'] : undefined, collector)
  collectSchemaRefs(isAiJsonSchema(schema['not']) ? schema['not'] : undefined, collector)
  collectSchemaRefs(isAiJsonSchema(schema['if']) ? schema['if'] : undefined, collector)
  collectSchemaRefs(isAiJsonSchema(schema['then']) ? schema['then'] : undefined, collector)
  collectSchemaRefs(isAiJsonSchema(schema['else']) ? schema['else'] : undefined, collector)
}

function collectSchemaMapRefs(
  value: unknown,
  collector: SchemaRefCollector,
): void {
  if (!isRecord(value)) return
  for (const child of Object.values(value)) {
    collectSchemaRefs(isAiJsonSchema(child) ? child : undefined, collector)
  }
}

function collectSchemaArrayRefs(
  value: unknown,
  collector: SchemaRefCollector,
): void {
  if (!Array.isArray(value)) return
  for (const child of value) {
    collectSchemaRefs(isAiJsonSchema(child) ? child : undefined, collector)
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

function readPayloadDefs(value: unknown): Readonly<Record<string, AiJsonSchema>> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error('PageDesign component payload catalog $defs must be an object')
  }
  const defs: Record<string, AiJsonSchema> = {}
  for (const [key, schema] of Object.entries(value)) {
    if (!isAiJsonSchema(schema)) {
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
    && (value['schema'] === undefined || isAiJsonSchema(value['schema']))
}

function isAiJsonSchema(value: unknown): value is AiJsonSchema {
  return typeof value === 'boolean' || isRecord(value)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}
