import {
  AiRuntime,
  AiModuleRegistrationBase,
  type AiBusinessRegistration,
  type AiBusinessRegistrationData,
  type AiBusinessRegistrationStoreSnapshot,
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
  type ParameterPayloadProvider,
} from '../../core'
import {
  PageDesignService,
  isPageDesignServiceResult,
  pageDesignServiceFailure,
  type PageDesignEditHost,
  type PageDesignServiceContext,
} from '@spark-view/spark-page-config'
import { DATASET_CATALOG_ROWS, validateDatasetParams } from './modules/dataset-tool-catalog'
import { LIFECYCLE_CATALOG_ROWS, validateLifecycleParams } from './modules/lifecycle-tool-catalog'
import { NODE_TREE_CATALOG_ROWS, validateNodeTreeParams } from './modules/node-tree-tool-catalog'
import { TEXT_MODEL_CATALOG_ROWS, validateTextModelParams } from './modules/text-model-tool-catalog'
import { KNOWLEDGE_CATALOG_ROWS, validateKnowledgeParams } from './modules/knowledge-tool-catalog'
import {
  SPARK_COMPONENT_PAYLOAD_DESCRIPTION,
  SPARK_COMPONENT_PAYLOAD_REF,
  guidePageDesignComponentPayload,
  queryPageDesignComponentPayloads,
} from './payloads/component-payload-catalog'

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'
export const LIFECYCLE_MODULE_ID = 'lifecycle'
export const TEXT_MODEL_MODULE_ID = 'textModel'
export const NODE_TREE_MODULE_ID = 'nodeTree'
export const DATASET_MODULE_ID = 'dataset'
export const KNOWLEDGE_MODULE_ID = 'knowledge'

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

export function assertPageDesignContext(context: { readonly moduleId: string }): asserts context is PageDesignRuntimeContext {
  if (context.moduleId !== PAGE_DESIGN_MODULE_ID) {
    throw new Error(`PageDesign context moduleId must be ${PAGE_DESIGN_MODULE_ID}, got ${context.moduleId}`)
  }
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
  readonly payloadRef: string
}

interface PageDesignServiceMethodBinding {
  readonly serviceLabel: string
  readonly methodName: string
  readonly mutates: boolean
  readonly fixHint: string
}

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
  return LIFECYCLE_CATALOG_ROWS.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateLifecycleParams(row.functionId, args),
    apply: (_args, context) => {
      switch (row.functionId) {
        case 'bootstrap':
          return service.bootstrap(toServiceContext(context))
        case 'describeProgress':
          return service.describeProgress(toServiceContext(context))
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
  return TEXT_MODEL_CATALOG_ROWS.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateTextModelParams(row.functionId, args),
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
  return KNOWLEDGE_CATALOG_ROWS.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateKnowledgeParams(row.functionId, args),
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
        case 'queryPayloads': {
          const input = toObject(args) ?? {}
          const filter = {
            ...(typeof input['category'] === 'string' ? { category: input['category'] } : {}),
            ...(typeof input['keyword'] === 'string' ? { keyword: input['keyword'] } : {}),
            ...(typeof input['expression'] === 'string' ? { expression: input['expression'] } : {}),
            ...(typeof input['limit'] === 'number' ? { limit: input['limit'] } : {}),
          }
          const items = runtime.knowledge.queryPayloads(runtime.payloadRef, filter)
          return { ok: true, data: { payloadRef: runtime.payloadRef, items }, summary: `已返回 ${items.length} 个组件目录摘要` }
        }
        case 'guidePayload': {
          const key = (args as { key: string }).key
          const guide = runtime.knowledge.guidePayload(runtime.payloadRef, key)
          if (guide === null) {
            return pageDesignServiceFailure(
              'PAYLOAD_NOT_FOUND',
              `组件 "${key}" 不在 ${runtime.payloadRef} 参数荷载目录中`,
              '先调用 queryPayloads 选择可用组件 type。',
            )
          }
          return { ok: true, data: { guide }, summary: `${key} 组件参数荷载指南已返回` }
        }
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
  return NODE_TREE_CATALOG_ROWS.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateNodeTreeParams(row.functionId, args),
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
  return DATASET_CATALOG_ROWS.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateDatasetParams(row.functionId, args),
    apply: (args, context) => {
      const methodBinding = createServiceMethodBinding(row, row.functionId, mutates.has(row.functionId))
      return service.useDatasetMethod(toServiceContext(context), args, methodBinding)
    },
  }))
}

const PAGE_DESIGN_COMPONENT_PAYLOAD_PROVIDER: ParameterPayloadProvider = {
  payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
  description: SPARK_COMPONENT_PAYLOAD_DESCRIPTION,
  queryPayloads: queryPageDesignComponentPayloads,
  guidePayload: guidePageDesignComponentPayload,
}

export class PageDesignModule implements AiBusinessRegistration {
  static readonly moduleId = PAGE_DESIGN_MODULE_ID

  readonly businessId = PAGE_DESIGN_MODULE_ID

  readonly moduleId = PAGE_DESIGN_MODULE_ID

  readonly name = 'Page Design'

  readonly description = '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。'

  readonly modules: readonly AiModuleRegistration[]

  readonly parameterPayloadProviders = [PAGE_DESIGN_COMPONENT_PAYLOAD_PROVIDER]

  private readonly service: PageDesignService

  private readonly core = new AiRuntime()

  private readonly ai: AiRegisteredBusinessApi

  private getFunctionBindingRuntime(): PageDesignFunctionBindingRuntime {
    return {
      service: this.service,
      knowledge: this.core.getKnowledgeProjection(),
      payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
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
        const allRows = [...LIFECYCLE_CATALOG_ROWS, ...TEXT_MODEL_CATALOG_ROWS, ...KNOWLEDGE_CATALOG_ROWS, ...NODE_TREE_CATALOG_ROWS, ...DATASET_CATALOG_ROWS] as readonly AiFunctionRegistration[]
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
    assertPageDesignContext(context)
    return this.ai.projectKnowledge({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  async startSession(context: PageDesignRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    assertPageDesignContext(context)
    return this.ai.startSession({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  stopSession(options: PageDesignStopSessionOptions): AiRuntimeStopSessionResult {
    assertPageDesignContext(options)
    return this.ai.stopSession({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
  }

  appendMessage(options: PageDesignAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    assertPageDesignContext(options)
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
    assertPageDesignContext(context)
    return this.ai.getSession(context.moduleInstanceId)
  }

  getSessionHistory(context: PageDesignRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    assertPageDesignContext(context)
    return this.ai.getSessionHistory(context.moduleInstanceId)
  }

  getRegistrationData(): AiModuleRegistrationData {
    return this.ai.getRegistrationData()
  }

  getBusinessRegistrationData(): AiBusinessRegistrationData {
    return this.ai.getBusinessRegistrationData()
  }

  getRegistrationStoreSnapshot(): AiModuleRegistrationStoreSnapshot {
    return this.ai.getRegistrationStoreSnapshot()
  }

  getBusinessRegistrationStoreSnapshot(): AiBusinessRegistrationStoreSnapshot {
    return this.ai.getBusinessRegistrationStoreSnapshot()
  }

  async translateFunctionCall(options: PageDesignExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallTranslationResult> {
    assertPageDesignContext(options)
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
    assertPageDesignContext(options)
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
