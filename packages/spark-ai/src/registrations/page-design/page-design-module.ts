import {
  AiRuntime,
  AiModuleRegistrationBase,
  AiKnowledgeCatalog,
  LlmParamsValidator,
  type IBusinessRegistration,
  type IBusinessRegistrationData,
  type IBusinessRegistrationStoreSnapshot,
  type AiModuleRegistration,
  type AiModuleRegistrationData,
  type AiModuleRegistrationStoreSnapshot,
  type AiFunctionRegistration,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeFunctionCallTranslationResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeMessageRole,
  type AiRuntimeMessageSource,
  type AiRuntimeSessionRecord,
  type AiRuntimeStartSessionResult,
  type AiRuntimeStopSessionResult,
  type AiKnowledgeProjection,
  type AiRegisteredBusinessApi,
  type FunctionExecutionContext,
  type LlmJsonSchema,
  type LlmParameterSchemaRoot,
} from '../../core'
import {
  PageDesignService,
  isPageDesignServiceResult,
  pageDesignServiceFailure,
  type PageDesignEditHost,
  type PageDesignServiceContext,
} from '@spark-view/spark-page-config'
import { DatasetModule } from './modules/dataset-tool-catalog'
import { LifecycleModule } from './modules/lifecycle-tool-catalog'
import { NodeTreeModule } from './modules/node-tree-tool-catalog'
import { TextModelModule } from './modules/text-model-tool-catalog'
import componentCatalogPayload from './payloads/component-catalog.json'

const PAGE_DESIGN_MODULE_ID = 'pageDesign'
const LIFECYCLE_MODULE_ID = 'lifecycle'
const TEXT_MODEL_MODULE_ID = 'textModel'
const NODE_TREE_MODULE_ID = 'nodeTree'
const DATASET_MODULE_ID = 'dataset'
const KNOWLEDGE_MODULE_ID = 'knowledge'

export type PageDesignModuleId =
  | typeof LIFECYCLE_MODULE_ID
  | typeof TEXT_MODEL_MODULE_ID
  | typeof NODE_TREE_MODULE_ID
  | typeof DATASET_MODULE_ID
  | typeof KNOWLEDGE_MODULE_ID

export interface PageDesignRuntimeContext {
  instanceId: string
  moduleId: typeof PAGE_DESIGN_MODULE_ID
  moduleInstanceId: string
}

export interface PageDesignModuleOptions {
  getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

export interface PageDesignExecuteFunctionCallOptions extends PageDesignRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export interface PageDesignAppendMessageOptions extends PageDesignRuntimeContext {
  readonly role: AiRuntimeMessageRole
  readonly content: string
  readonly source?: AiRuntimeMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface PageDesignStopSessionOptions extends PageDesignRuntimeContext {
  readonly reason?: string | undefined
}


type PageDesignFunctionApply = (args: unknown, context: FunctionExecutionContext) => object | AiRuntimeFunctionCallResult<unknown> | Promise<object | AiRuntimeFunctionCallResult<unknown>>

interface PageDesignFunctionHandler<_TModuleId extends PageDesignModuleId> {
  readonly functionId: string
  validate?: (args: unknown, context: FunctionExecutionContext) => string | null
  apply: PageDesignFunctionApply
}

interface PageDesignFunctionBindingRuntime {
  readonly service: PageDesignService
  readonly knowledge: AiKnowledgeProjection
}

interface PageDesignServiceMethodBinding {
  readonly serviceLabel: string
  readonly methodName: string
  readonly mutates: boolean
  readonly fixHint: string
}

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

const PAGE_DESIGN_COMPONENT_CATALOG: PageDesignPayloadCatalog = componentCatalogPayload as PageDesignPayloadCatalog

const PAGE_DESIGN_PAYLOAD_FUNCTIONS: readonly AiFunctionRegistration[] = [
  {
    functionId: 'queryPayloads',
    description: '查询可用于当前页面设计的组件参数荷载目录，支持 category/keyword/key/expression 过滤。',
    paramsSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '兼容旧调用的查询表达式，例如 components[?category==`container`].type。' },
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
    usageRules: [
      '新增或替换 SparkNode 前先查询候选组件。',
      '拿到目标 key 后再调用 guidePayload 获取完整 paramsSchema。',
    ],
  },
  {
    functionId: 'guidePayload',
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

function toObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function toServiceContext(context: PageDesignRuntimeContext | FunctionExecutionContext): PageDesignServiceContext {
  return {
    requestId: context.instanceId,
    pageId: context.moduleInstanceId,
  }
}

function toKnowledgeScope(context: FunctionExecutionContext): { moduleId: string; moduleInstanceId: string } {
  return {
    moduleId: context.moduleId,
    moduleInstanceId: context.moduleInstanceId,
  }
}

function payloadRows(): PageDesignPayloadEntry[] {
  return Object.values(PAGE_DESIGN_COMPONENT_CATALOG.components)
}

function payloadKey(entry: PageDesignPayloadEntry): string {
  return entry.type
}

function payloadMatchesExpression(entry: PageDesignPayloadEntry, expression: string): boolean {
  const categoryMatch = /category\s*==\s*`([^`]+)`/.exec(expression)
  if (categoryMatch !== null) {
    return entry.category === categoryMatch[1]
  }
  const typeMatch = /type\s*==\s*`([^`]+)`/.exec(expression)
  if (typeMatch !== null) {
    return entry.type === typeMatch[1]
  }
  return true
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

function payloadLimit(input: Record<string, unknown>): number {
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

function queryPageDesignPayloads(args: unknown): AiRuntimeFunctionCallResult<unknown> {
  const input = toObject(args) ?? {}
  const expression = typeof input['expression'] === 'string' ? input['expression'].trim() : ''
  const category = typeof input['category'] === 'string' ? input['category'].trim() : ''
  const keyword = typeof input['keyword'] === 'string' ? input['keyword'].trim() : ''
  const key = typeof input['key'] === 'string' ? input['key'].trim() : ''
  const configurableOnly = input['configurableOnly'] === true
  const limit = payloadLimit(input)

  let rows = payloadRows()
  if (expression.length > 0) {
    rows = rows.filter((entry) => payloadMatchesExpression(entry, expression))
  }
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

function guidePageDesignPayload(args: unknown): AiRuntimeFunctionCallResult<unknown> {
  const input = toObject(args) ?? {}
  const key = typeof input['key'] === 'string' ? input['key'].trim() : ''
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

function createServiceMethodBinding(row: AiFunctionRegistration, methodName: string, mutates: boolean): PageDesignServiceMethodBinding {
  const parts = [`参数格式: ${JSON.stringify(row.paramsSchema)}`]
  const example = row.example ?? {}
  if (Object.keys(example).length > 0) {
    parts.push(`示例: ${JSON.stringify(example)}`)
  }
  if (row.usageRules && row.usageRules.length > 0) {
    parts.push(`关键规则: ${row.usageRules.join('；')}`)
  }
  return {
    serviceLabel: row.functionId,
    methodName,
    mutates,
    fixHint: parts.join('；'),
  }
}

// =========================================================
// Lifecycle handler factory
// =========================================================
function createLifecycleHandlers(
  service: PageDesignService,
): ReadonlyArray<PageDesignFunctionHandler<typeof LIFECYCLE_MODULE_ID>> {
  return new LifecycleModule().functions.map((row) => ({
    functionId: row.functionId,
    validate: (args) => {
      const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
      return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
    },
    apply: (_args, context) => {
      switch (row.functionId) {
        case 'bootstrap':
          return service.bootstrap(toServiceContext(context))
        case 'describeProgress':
          return service.describeProgress(toServiceContext(context))
        default:
          throw new Error(`unreachable: ${row.functionId}`)
      }
    },
  }))
}

// =========================================================
// TextModel handler factory
// =========================================================
function createTextModelHandlers(
  service: PageDesignService,
): ReadonlyArray<PageDesignFunctionHandler<typeof TEXT_MODEL_MODULE_ID>> {
  return new TextModelModule().functions.map((row) => ({
    functionId: row.functionId,
    validate: (args) => {
      const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
      return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
    },
    apply: (args, context) => {
      switch (row.functionId) {
        case 'readScript':
          return service.readTextModel(toServiceContext(context), 'script')
        case 'writeScript':
          return service.writeTextModel(toServiceContext(context), 'script', (args as { content: string }).content)
        case 'readStyle':
          return service.readTextModel(toServiceContext(context), 'style')
        case 'writeStyle':
          return service.writeTextModel(toServiceContext(context), 'style', (args as { content: string }).content)
        default:
          throw new Error(`unreachable: ${row.functionId}`)
      }
    },
  }))
}

// =========================================================
// Knowledge handler factory
// =========================================================
function createKnowledgeHandlers(
  runtime: PageDesignFunctionBindingRuntime,
): ReadonlyArray<PageDesignFunctionHandler<typeof KNOWLEDGE_MODULE_ID>> {
  const rows = [...new AiKnowledgeCatalog({}).parameterTable, ...PAGE_DESIGN_PAYLOAD_FUNCTIONS]
  return rows.map((row) => ({
    functionId: row.functionId,
    validate: (args) => {
      const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
      return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
    },
    apply: (args, context) => {
      switch (row.functionId) {
        case 'queryFunctions': {
          const input = toObject(args) ?? {}
          const items = runtime.knowledge.queryFunctions(toKnowledgeScope(context), {
            ...(typeof input['modulePath'] === 'string' ? { modulePath: input['modulePath'] } : {}),
            ...(typeof input['moduleId'] === 'string' ? { moduleId: input['moduleId'] } : {}),
            ...(typeof input['keyword'] === 'string' ? { keyword: input['keyword'] } : {}),
          })
          return { ok: true, data: { items }, summary: `已返回 ${items.length} 个函数目录项` }
        }
        case 'queryModules': {
          const items = runtime.knowledge.queryModules(toKnowledgeScope(context))
          return { ok: true, data: { items }, summary: `已返回 ${items.length} 个模块目录项` }
        }
        case 'guideFunction': {
          const action = (args as { action: string }).action
          const guide = runtime.knowledge.guideFunction(toKnowledgeScope(context), action)
          if (guide === null) {
            return pageDesignServiceFailure(
              'FUNCTION_NOT_FOUND',
              `函数 "${action}" 不在当前会话函数目录中`,
              '先调用 queryFunctions 确认 action，再重试。',
            )
          }
          return { ok: true, data: { guide }, summary: `${action} 函数指南已返回` }
        }
        case 'queryPayloads':
          return queryPageDesignPayloads(args)
        case 'guidePayload':
          return guidePageDesignPayload(args)
        default:
          throw new Error(`unreachable: ${row.functionId}`)
      }
    },
  }))
}

// =========================================================
// NodeTree handler factory
// =========================================================
function createNodeTreeHandlers(
  service: PageDesignService,
): ReadonlyArray<PageDesignFunctionHandler<typeof NODE_TREE_MODULE_ID>> {
  return new NodeTreeModule().functions.map((row) => ({
    functionId: row.functionId,
    validate: (args) => {
      const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
      return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
    },
    apply: (args, context) => {
      const methodBinding = createServiceMethodBinding(row, row.functionId, ['addNode', 'addNodes', 'moveNode', 'setProps', 'setPropsBatch', 'replaceNode', 'replaceNodes', 'removeNode', 'removeNodes'].includes(row.functionId))
      return service.useNodeTreeMethod(toServiceContext(context), args, methodBinding)
    },
  }))
}

// =========================================================
// Dataset handler factory
// =========================================================
function createDatasetHandlers(
  service: PageDesignService,
): ReadonlyArray<PageDesignFunctionHandler<typeof DATASET_MODULE_ID>> {
  const mutates = new Set([
    'undo', 'redo', 'clearHistory',
    'createColumn', 'updateColumn', 'renameColumn', 'deleteColumn',
    'createTable', 'updateTable', 'renameTable', 'deleteTable',
    'createView', 'updateView', 'deleteView',
    'createRow', 'createRows', 'updateRow', 'updateRows', 'deleteRow', 'deleteRows',
    'createRelation', 'updateRelation', 'deleteRelation',
    'createDependency', 'updateDependency', 'deleteDependency',
    'addAggregate', 'updateAggregate', 'removeAggregate',
    'setComputeExpression', 'clearComputeExpression',
  ])
  return new DatasetModule().functions.map((row) => ({
    functionId: row.functionId,
    validate: (args) => {
      const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
      return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
    },
    apply: (args, context) => {
      const methodBinding = createServiceMethodBinding(row, row.functionId, mutates.has(row.functionId))
      return service.useDatasetMethod(toServiceContext(context), args, methodBinding)
    },
  }))
}

export class PageDesignModule implements IBusinessRegistration {
  static readonly moduleId = PAGE_DESIGN_MODULE_ID

  static assertContext(context: { readonly moduleId: string }): asserts context is PageDesignRuntimeContext {
    if (context.moduleId !== PAGE_DESIGN_MODULE_ID) {
      throw new Error(`PageDesign context moduleId must be ${PAGE_DESIGN_MODULE_ID}, got ${context.moduleId}`)
    }
  }

  readonly businessId = PAGE_DESIGN_MODULE_ID

  readonly moduleId = PAGE_DESIGN_MODULE_ID

  readonly name = 'Page Design'

  readonly description = '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。'

  readonly entity: Record<string, () => unknown> = {}

  readonly prompt = '你正在处理页面设计业务，支持 lifecycle、textModel、nodeTree、dataset、knowledge 五大子模块。'

  readonly functions: readonly AiFunctionRegistration[] = []

  readonly modules: readonly AiModuleRegistration[]

  private readonly service: PageDesignService

  private readonly core = new AiRuntime()

  private readonly ai: AiRegisteredBusinessApi

  private getFunctionBindingRuntime(): PageDesignFunctionBindingRuntime {
    return {
      service: this.service,
      knowledge: this.core.getKnowledgeProjection(),
    }
  }

  private createModule<TModuleId extends PageDesignModuleId>(
    moduleId: TModuleId,
    name: string,
    description: string,
    prompt: string,
    handlers: ReadonlyArray<PageDesignFunctionHandler<TModuleId>>,
  ): AiModuleRegistration {
    return new (class extends AiModuleRegistrationBase {
      constructor() { super(moduleId, name, description, prompt) }
      override getFunctions(): ReadonlyArray<AiFunctionRegistration & { apply: PageDesignFunctionApply }> {
        const allRows = [...new LifecycleModule().functions, ...new TextModelModule().functions, ...new NodeTreeModule().functions, ...new DatasetModule().functions, ...new AiKnowledgeCatalog({}).parameterTable, ...PAGE_DESIGN_PAYLOAD_FUNCTIONS] as readonly AiFunctionRegistration[]
        return handlers.map((handler) => ({
          functionId: handler.functionId,
          description: allRows.find(r => r.functionId === handler.functionId)?.description ?? handler.functionId,
          paramsSchema: allRows.find(r => r.functionId === handler.functionId)?.paramsSchema ?? { type: 'object', properties: {} },
          ...(handler.validate === undefined ? {} : { validate: handler.validate }),
          apply: handler.apply,
        }))
      }
    })()
  }

  constructor(options: PageDesignModuleOptions) {
    this.service = new PageDesignService({
      getEditHost: (context) => options.getEditToolHost({
        instanceId: context.requestId,
        moduleId: PAGE_DESIGN_MODULE_ID,
        moduleInstanceId: context.pageId,
      }),
    })
    const runtime = this.getFunctionBindingRuntime()
    this.modules = [
      this.createModule(LIFECYCLE_MODULE_ID, 'Page Design Lifecycle', '页面设计编辑运行态引导与进度查询。', '', createLifecycleHandlers(this.service)),
      this.createModule(TEXT_MODEL_MODULE_ID, 'Page Design Text Model', '当前页面 script.js/style.css live 文本模型读写。', '', createTextModelHandlers(this.service)),
      this.createModule(KNOWLEDGE_MODULE_ID, 'Page Design Knowledge', '当前页面设计组件参数荷载知识查询。', '', createKnowledgeHandlers(runtime)),
      this.createModule(NODE_TREE_MODULE_ID, 'Page Design Node Tree', '当前页面 SparkNodeTree/rule.json 结构读写。', '', createNodeTreeHandlers(this.service)),
      this.createModule(DATASET_MODULE_ID, 'Page Design DataSet', '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。', '', createDatasetHandlers(this.service)),
    ]
    this.ai = this.core.registerBusiness(this)
  }

  async projectKnowledge(context: PageDesignRuntimeContext): Promise<AiRuntimeKnowledgeProjection> {
    PageDesignModule.assertContext(context)
    return this.ai.projectKnowledge({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  async startSession(context: PageDesignRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    PageDesignModule.assertContext(context)
    return this.ai.startSession({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  stopSession(options: PageDesignStopSessionOptions): AiRuntimeStopSessionResult {
    PageDesignModule.assertContext(options)
    return this.ai.stopSession({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
  }

  appendMessage(options: PageDesignAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    PageDesignModule.assertContext(options)
    return this.ai.appendMessage({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      role: options.role,
      content: options.content,
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })
  }

  getSession(context: PageDesignRuntimeContext): AiRuntimeSessionRecord | null {
    PageDesignModule.assertContext(context)
    return this.ai.getSession(context.moduleInstanceId)
  }

  listSessions(): readonly AiRuntimeSessionRecord[] {
    return this.ai.listSessions()
  }

  getSessionHistory(context: PageDesignRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    PageDesignModule.assertContext(context)
    return this.ai.getSessionHistory(context.moduleInstanceId)
  }

  getRegistrationData(): AiModuleRegistrationData {
    return this.ai.getRegistrationData()
  }

  getBusinessRegistrationData(): IBusinessRegistrationData {
    return this.ai.getBusinessRegistrationData()
  }

  getRegistrationStoreSnapshot(): AiModuleRegistrationStoreSnapshot {
    return this.ai.getRegistrationStoreSnapshot()
  }

  getBusinessRegistrationStoreSnapshot(): IBusinessRegistrationStoreSnapshot {
    return this.ai.getBusinessRegistrationStoreSnapshot()
  }

  async translateFunctionCall(options: PageDesignExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallTranslationResult> {
    PageDesignModule.assertContext(options)
    return this.ai.translateFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
    })
  }

  async executeFunctionCall(options: PageDesignExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    PageDesignModule.assertContext(options)
    return this.ai.executeFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
      validate: ({ functionRegistration, args, context }) => (
        functionRegistration as AiFunctionRegistration & { validate?: (args: unknown, context: FunctionExecutionContext) => string | null }
      ).validate?.(args, context) ?? null,
      run: ({ functionRegistration, args, context }) => (
        functionRegistration as AiFunctionRegistration & { apply: PageDesignFunctionApply }
      ).apply(args, context),
      normalizeResult: (value) => isPageDesignServiceResult(value)
        ? value
        : {
          ok: true,
          data: value,
          summary: `${options.action} executed`,
        },
      errorFix: `Fix ${options.action} implementation or retry with valid args after checking page-design state.`,
    })
  }

  releaseModuleInstance(moduleInstanceId: string): void {
    this.service.releasePage(moduleInstanceId)
  }

  getFunctions(): readonly AiFunctionRegistration[] {
    return []
  }
}
