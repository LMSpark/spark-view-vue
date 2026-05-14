import {
  AiRuntime,
  AiModuleRegistrationBase,
  type AiBusinessRegistration,
  type AiBusinessRegistrationData,
  type AiBusinessRegistrationStoreSnapshot,
  type AiRegisteredBusinessApi,
  type AiKnowledgeProjection,
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
  type AiRuntimeStartInstanceResult,
  type AiRuntimeStopInstanceResult,
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
import { PageDesignDatasetCatalog } from './modules/dataset-tool-catalog'
import { PageDesignLifecycleCatalog } from './modules/lifecycle-tool-catalog'
import { PageDesignNodeTreeCatalog } from './modules/node-tree-tool-catalog'
import { PageDesignTextModelCatalog } from './modules/text-model-tool-catalog'
import { PageDesignKnowledgeCatalog } from './modules/knowledge-tool-catalog'
import type {
  PageDesignFunctionCatalogRow,
  PageDesignKnowledgeRuntimeBinding,
  PageDesignServiceRuntimeBinding,
} from './modules/tool-catalog'
import {
  PAGE_DESIGN_DATASET_MODULE_PROMPT,
  PAGE_DESIGN_KNOWLEDGE_MODULE_PROMPT,
  PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
  PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
  PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT,
} from './prompts/module-prompts'
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

type PageDesignFunctionDefinition<TModuleId extends PageDesignModuleId> = AiFunctionRegistration & {
  readonly moduleId: TModuleId
  validate?(args: unknown, context: FunctionExecutionContext): string | null
  apply(args: unknown, context: FunctionExecutionContext): object | AiRuntimeFunctionCallResult<unknown> | Promise<object | AiRuntimeFunctionCallResult<unknown>>
}

type PageDesignFunctionHandler<TModuleId extends PageDesignModuleId> = {
  readonly functionId: string
  validate?: (args: unknown, context: FunctionExecutionContext) => string | null
  apply: PageDesignFunctionDefinition<TModuleId>['apply']
}

type PageDesignFunctionApplyResult =
  | object
  | AiRuntimeFunctionCallResult<unknown>
  | Promise<object | AiRuntimeFunctionCallResult<unknown>>

type PageDesignCatalogLike = {
  validateParams(functionId: string, params: unknown): string | null
}

interface PageDesignFunctionBindingRuntime {
  readonly service: PageDesignService
  readonly knowledge: AiKnowledgeProjection
  readonly payloadRef: string
}

interface PageDesignBindingApplyInput {
  readonly row: PageDesignFunctionCatalogRow
  readonly args: unknown
  readonly context: FunctionExecutionContext
  readonly runtime: PageDesignFunctionBindingRuntime
}

interface PageDesignServiceBindingApplyInput extends PageDesignBindingApplyInput {
  readonly binding: PageDesignServiceRuntimeBinding
}

interface PageDesignKnowledgeBindingApplyInput extends PageDesignBindingApplyInput {
  readonly binding: PageDesignKnowledgeRuntimeBinding
}

interface PageDesignModuleFactoryOptions<TModuleId extends PageDesignModuleId> {
  moduleId: TModuleId
  name: string
  description: string
  prompt: string
  catalogRows: readonly PageDesignFunctionCatalogRow[]
  getRuntimeHandlers: () => ReadonlyArray<PageDesignFunctionHandler<TModuleId>>
}

function createFunctionDefinitionsFromCatalog<TModuleId extends PageDesignModuleId>(
  moduleId: TModuleId,
  rows: readonly PageDesignFunctionCatalogRow[],
  serviceHandlers: ReadonlyArray<PageDesignFunctionHandler<TModuleId>>,
): ReadonlyArray<PageDesignFunctionDefinition<TModuleId>> {
  const handlerIndex = new Map(serviceHandlers.map((handler) => [handler.functionId, handler]))
  const definitions = rows.map((row) => {
    const serviceHandler = handlerIndex.get(row.functionId)
    if (serviceHandler === undefined) {
      throw new Error(`Missing service handler for ${moduleId}.${row.functionId}`)
    }

    return {
      moduleId,
      functionId: row.functionId,
      description: row.description,
      paramsSchema: row.paramsSchema,
      resultSchema: row.resultSchema,
      usageRules: row.usageRules,
      failureModes: row.failureModes,
      ...(serviceHandler.validate === undefined ? {} : { validate: serviceHandler.validate }),
      apply: serviceHandler.apply,
    }
  })

  if (definitions.length !== serviceHandlers.length) {
    const definedIds = new Set(rows.map((row) => row.functionId))
    const extraHandlers = serviceHandlers
      .map((handler) => handler.functionId)
      .filter((functionId) => !definedIds.has(functionId))
    if (extraHandlers.length > 0) {
      throw new Error(`Unregistered service handlers for ${moduleId}: ${extraHandlers.join(', ')}`)
    }
  }

  return definitions
}

const PAGE_DESIGN_COMPONENT_PAYLOAD_PROVIDER: ParameterPayloadProvider = {
  payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
  description: SPARK_COMPONENT_PAYLOAD_DESCRIPTION,
  queryPayloads: queryPageDesignComponentPayloads,
  guidePayload: guidePageDesignComponentPayload,
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const LIFECYCLE_CATALOG = new PageDesignLifecycleCatalog()
const TEXT_MODEL_CATALOG = new PageDesignTextModelCatalog()
const KNOWLEDGE_CATALOG = new PageDesignKnowledgeCatalog()
const NODE_TREE_CATALOG = new PageDesignNodeTreeCatalog()
const DATASET_CATALOG = new PageDesignDatasetCatalog()

class PageDesignModuleRegistration<TModuleId extends PageDesignModuleId> extends AiModuleRegistrationBase {
  constructor(options: PageDesignModuleFactoryOptions<TModuleId>) {
    super(options.moduleId, options.name, options.description, options.prompt)
    this.catalogRows = options.catalogRows
    this.getRuntimeHandlers = options.getRuntimeHandlers
  }

  private readonly catalogRows: readonly PageDesignFunctionCatalogRow[]

  private readonly getRuntimeHandlers: () => ReadonlyArray<PageDesignFunctionHandler<TModuleId>>

  override getFunctions(): ReadonlyArray<PageDesignFunctionDefinition<TModuleId>> {
    return createFunctionDefinitionsFromCatalog(this.moduleId as TModuleId, this.catalogRows, this.getRuntimeHandlers())
  }
}

function toServiceMethodBinding(
  row: PageDesignFunctionCatalogRow,
  methodName: string,
): Parameters<PageDesignService['useNodeTreeMethod']>[2] {
  const parts = [`参数格式: ${JSON.stringify(row.paramsSchema)}`]
  if (Object.keys(row.example).length > 0) {
    parts.push(`示例: ${JSON.stringify(row.example)}`)
  }
  if (row.usageRules.length > 0) {
    parts.push(`关键规则: ${row.usageRules.join('；')}`)
  }
  return {
    serviceLabel: row.functionId,
    methodName,
    mutates: row.type === 'request',
    fixHint: parts.join('；'),
  }
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

function getTextModelFileKey(binding: PageDesignServiceRuntimeBinding): 'script' | 'style' {
  if ('fileKey' in binding) return binding.fileKey
  throw new Error(`Service binding ${binding.method} must declare fileKey`)
}

function getTargetMethod(binding: PageDesignServiceRuntimeBinding): string {
  if ('targetMethod' in binding) return binding.targetMethod
  throw new Error(`Service binding ${binding.method} must declare targetMethod`)
}

type PageDesignServiceBindingApplier = (input: PageDesignServiceBindingApplyInput) => PageDesignFunctionApplyResult
type PageDesignKnowledgeBindingApplier = (input: PageDesignKnowledgeBindingApplyInput) => PageDesignFunctionApplyResult

const PAGE_DESIGN_SERVICE_BINDING_APPLIERS: Record<PageDesignServiceRuntimeBinding['method'], PageDesignServiceBindingApplier> = {
  bootstrap: ({ runtime, context }) => runtime.service.bootstrap(toServiceContext(context)),
  describeProgress: ({ runtime, context }) => runtime.service.describeProgress(toServiceContext(context)),
  readTextModel: ({ runtime, binding, context }) => runtime.service.readTextModel(
    toServiceContext(context),
    getTextModelFileKey(binding),
  ),
  writeTextModel: ({ runtime, binding, args, context }) => runtime.service.writeTextModel(
    toServiceContext(context),
    getTextModelFileKey(binding),
    (args as { content: string }).content,
  ),
  useNodeTreeMethod: ({ runtime, binding, row, args, context }) => runtime.service.useNodeTreeMethod(
    toServiceContext(context),
    args,
    toServiceMethodBinding(row, getTargetMethod(binding)),
  ),
  useDatasetMethod: ({ runtime, binding, row, args, context }) => runtime.service.useDatasetMethod(
    toServiceContext(context),
    args,
    toServiceMethodBinding(row, getTargetMethod(binding)),
  ),
}

const PAGE_DESIGN_KNOWLEDGE_BINDING_APPLIERS: Record<PageDesignKnowledgeRuntimeBinding['method'], PageDesignKnowledgeBindingApplier> = {
  queryFunctions: ({ runtime, args, context }) => {
    const input = toObject(args) ?? {}
    const items = runtime.knowledge.queryFunctions(toKnowledgeScope(context), {
      ...(typeof input['modulePath'] === 'string' ? { modulePath: input['modulePath'] } : {}),
      ...(typeof input['moduleId'] === 'string' ? { moduleId: input['moduleId'] } : {}),
      ...(typeof input['keyword'] === 'string' ? { keyword: input['keyword'] } : {}),
    })
    return { ok: true, data: { items }, summary: `已返回 ${items.length} 个函数目录项` }
  },
  queryModules: ({ runtime, context }) => {
    const items = runtime.knowledge.queryModules(toKnowledgeScope(context))
    return { ok: true, data: { items }, summary: `已返回 ${items.length} 个模块目录项` }
  },
  guideFunction: ({ runtime, args, context }) => {
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
  },
  queryPayloads: ({ runtime, args }) => {
    const input = toObject(args) ?? {}
    const filter = {
      ...(typeof input['category'] === 'string' ? { category: input['category'] } : {}),
      ...(typeof input['keyword'] === 'string' ? { keyword: input['keyword'] } : {}),
      ...(typeof input['expression'] === 'string' ? { expression: input['expression'] } : {}),
      ...(typeof input['limit'] === 'number' ? { limit: input['limit'] } : {}),
    }
    const items = runtime.knowledge.queryPayloads(runtime.payloadRef, filter)
    return { ok: true, data: { payloadRef: runtime.payloadRef, items }, summary: `已返回 ${items.length} 个组件目录摘要` }
  },
  guidePayload: ({ runtime, args }) => {
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
  },
}

function applyRuntimeBinding(input: PageDesignBindingApplyInput): PageDesignFunctionApplyResult {
  const { runtimeBinding } = input.row
  if (runtimeBinding.kind === 'page-design-service') {
    return PAGE_DESIGN_SERVICE_BINDING_APPLIERS[runtimeBinding.method]({
      ...input,
      binding: runtimeBinding,
    })
  }
  return PAGE_DESIGN_KNOWLEDGE_BINDING_APPLIERS[runtimeBinding.method]({
    ...input,
    binding: runtimeBinding,
  })
}

function createFunctionHandlers<TModuleId extends PageDesignModuleId>(
  catalog: PageDesignCatalogLike,
  rows: readonly PageDesignFunctionCatalogRow[],
  runtime: PageDesignFunctionBindingRuntime,
): ReadonlyArray<PageDesignFunctionHandler<TModuleId>> {
  return rows.map((row) => ({
    functionId: row.functionId,
    validate: (args) => catalog.validateParams(row.functionId, args),
    apply: (args, context) => applyRuntimeBinding({ row, args, context, runtime }),
  }))
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

  constructor(options: PageDesignModuleOptions) {
    this.service = new PageDesignService({
      getEditHost: (context) => options.getEditToolHost({
        instanceId: context.requestId,
        moduleId: PAGE_DESIGN_MODULE_ID,
        moduleInstanceId: context.pageId,
      }),
    })
    this.modules = [
      new PageDesignModuleRegistration({
        moduleId: LIFECYCLE_MODULE_ID,
        name: 'Page Design Lifecycle',
        description: '页面设计编辑运行态引导与进度查询。',
        prompt: PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
        catalogRows: LIFECYCLE_CATALOG.parameterTable,
        getRuntimeHandlers: () => createFunctionHandlers(
          LIFECYCLE_CATALOG,
          LIFECYCLE_CATALOG.parameterTable,
          this.getFunctionBindingRuntime(),
        ),
      }),
      new PageDesignModuleRegistration({
        moduleId: TEXT_MODEL_MODULE_ID,
        name: 'Page Design Text Model',
        description: '当前页面 script.js/style.css live 文本模型读写。',
        prompt: PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT,
        catalogRows: TEXT_MODEL_CATALOG.parameterTable,
        getRuntimeHandlers: () => createFunctionHandlers(
          TEXT_MODEL_CATALOG,
          TEXT_MODEL_CATALOG.parameterTable,
          this.getFunctionBindingRuntime(),
        ),
      }),
      new PageDesignModuleRegistration({
        moduleId: KNOWLEDGE_MODULE_ID,
        name: 'Page Design Knowledge',
        description: '当前页面设计组件参数荷载知识查询。',
        prompt: PAGE_DESIGN_KNOWLEDGE_MODULE_PROMPT,
        catalogRows: KNOWLEDGE_CATALOG.parameterTable,
        getRuntimeHandlers: () => createFunctionHandlers(
          KNOWLEDGE_CATALOG,
          KNOWLEDGE_CATALOG.parameterTable,
          this.getFunctionBindingRuntime(),
        ),
      }),
      new PageDesignModuleRegistration({
        moduleId: NODE_TREE_MODULE_ID,
        name: 'Page Design Node Tree',
        description: '当前页面 SparkNodeTree/rule.json 结构读写。',
        prompt: PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
        catalogRows: NODE_TREE_CATALOG.parameterTable,
        getRuntimeHandlers: () => createFunctionHandlers(
          NODE_TREE_CATALOG,
          NODE_TREE_CATALOG.parameterTable,
          this.getFunctionBindingRuntime(),
        ),
      }),
      new PageDesignModuleRegistration({
        moduleId: DATASET_MODULE_ID,
        name: 'Page Design DataSet',
        description: '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。',
        prompt: PAGE_DESIGN_DATASET_MODULE_PROMPT,
        catalogRows: DATASET_CATALOG.parameterTable,
        getRuntimeHandlers: () => createFunctionHandlers(
          DATASET_CATALOG,
          DATASET_CATALOG.parameterTable,
          this.getFunctionBindingRuntime(),
        ),
      }),
    ]
    this.ai = this.core.registerBusiness(this)
  }

  async projectKnowledge(context: PageDesignRuntimeContext): Promise<AiRuntimeKnowledgeProjection> {
    assertPageDesignContext(context)
    return this.ai.projectModule({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  async startSession(context: PageDesignRuntimeContext): Promise<AiRuntimeStartInstanceResult> {
    assertPageDesignContext(context)
    return this.ai.startInstance({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  stopSession(options: PageDesignStopSessionOptions): AiRuntimeStopInstanceResult {
    assertPageDesignContext(options)
    return this.ai.stopInstance({
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
    return this.ai.getSessionByModuleInstance(context.moduleInstanceId)
  }

  getSessionHistory(context: PageDesignRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    assertPageDesignContext(context)
    return this.ai.getSessionHistoryByModuleInstance(context.moduleInstanceId)
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
        functionRegistration as PageDesignFunctionDefinition<PageDesignModuleId>
      ).validate?.(args, context) ?? null,
      run: ({ functionRegistration, args, context }) => (
        functionRegistration as PageDesignFunctionDefinition<PageDesignModuleId>
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
