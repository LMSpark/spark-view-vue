/**
 * PageDesign module-semantic 业务注册。
 *
 * PageDesign 只注册到 Host 一次(moduleId=pageDesign),内部暴露 5 个扁平 kind:
 * lifecycle / text-model / payload-catalog / node-tree / dataset。
 *
 * LLM 固定走 6 个协议工具:
 * listChildren("/") → findInstance("/", kind, {}) → describeKind(kind) →
 * invokeAction("/<kind>[<pageId>]", actionName, args)。
 */

import {
  DefaultAiHostSessionStore,
  type AiHostBusinessRegistration,
  type AiHostBusinessRuntimeContext,
  type AiHostFunctionCallResult,
} from '@spark-view/spark-ai/host'
import {
  ModuleCapability,
  ModuleKindBase,
  ModuleSemanticRuntime,
  errorCheck,
  infoCheck,
  ok as okResult,
  type ActionSchema,
  type ModuleInstanceQuery,
  type ModuleInstanceRef,
  type ModulePathContext,
  type OperationResult,
} from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'
import {
  PageDesignService,
  type PageDesignServiceContext,
  type PageDesignServiceMethodBinding,
  type PageDesignServiceResult,
} from '../../../page/workspace/services/page-design-service'
import type { PageDesignEditHost } from '../../../page/workspace/editing/page-design-edit-session'
import { DATASET_ACTIONS, DATASET_MUTATING_ACTION_NAMES } from './modules/dataset-tool-catalog'
import { LIFECYCLE_ACTIONS } from './modules/lifecycle-tool-catalog'
import { PAYLOAD_CATALOG_ACTIONS, runPayloadCatalogAction } from './modules/payload-catalog-tool-catalog'
import { TEXT_MODEL_ACTIONS } from './modules/text-model-tool-catalog'
import { NodeTreeCapability, NodeTreeModuleKind } from './module-semantic'

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

export type PageDesignModuleKindId =
  | 'lifecycle'
  | 'text-model'
  | 'payload-catalog'
  | 'node-tree'
  | 'dataset'

export interface PageDesignRuntimeContext {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

export interface PageDesignModuleOptions {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

class LifecycleModuleKind extends ModuleKindBase {
  public constructor() {
    super({
      kind: 'lifecycle',
      name: 'Page Design Lifecycle',
      description: '页面设计编辑运行态引导与进度查询。',
      actions: LIFECYCLE_ACTIONS,
      children: [],
    })
  }
}

class TextModelModuleKind extends ModuleKindBase {
  public constructor() {
    super({
      kind: 'text-model',
      name: 'Page Design Text Model',
      description: '当前页面 script.js/style.css live 文本模型读写。',
      actions: TEXT_MODEL_ACTIONS,
      children: [],
    })
  }
}

class PayloadCatalogModuleKind extends ModuleKindBase {
  public constructor() {
    super({
      kind: 'payload-catalog',
      name: 'Page Design Payload Catalog',
      description: '当前页面设计组件参数荷载知识查询。',
      actions: PAYLOAD_CATALOG_ACTIONS,
      children: [],
    })
  }
}

class DatasetModuleKind extends ModuleKindBase {
  public constructor() {
    super({
      kind: 'dataset',
      name: 'Page Design DataSet',
      description: '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。',
      actions: DATASET_ACTIONS,
      children: [],
    })
  }
}

class PageDesignActionCapability extends ModuleCapability {
  public readonly kind: PageDesignModuleKindId

  private readonly service: PageDesignService

  private readonly label: string

  private readonly actions: ReadonlyMap<string, ActionSchema>

  public constructor(options: {
    readonly kind: PageDesignModuleKindId
    readonly label: string
    readonly service: PageDesignService
    readonly actions: readonly ActionSchema[]
  }) {
    super()
    this.kind = options.kind
    this.label = options.label
    this.service = options.service
    this.actions = new Map(options.actions.map((action) => [action.name, action]))
  }

  public getAttribute(): Promise<OperationResult<LlmJsonValue>> {
    return Promise.resolve({
      ok: false,
      checks: [errorCheck('ATTRIBUTE_NOT_DECLARED', `${this.kind} 未暴露任何属性`, '请通过 invokeAction 调用具体动作')],
    })
  }

  public setAttribute(): Promise<OperationResult<void>> {
    return Promise.resolve({
      ok: false,
      checks: [errorCheck('ATTRIBUTE_NOT_DECLARED', `${this.kind} 未暴露任何属性`, '请通过 invokeAction 调用具体动作')],
    })
  }

  public invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<OperationResult<LlmJsonValue>> {
    return Promise.resolve(this.runAction(ctx, actionName, args))
  }

  public listChildren(): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([]))
  }

  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    _query: ModuleInstanceQuery,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    if (childKind !== this.kind) {
      return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([]))
    }
    const pageId = currentPageId(ctx)
    if (pageId.length === 0) {
      return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([]))
    }
    return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([
      { id: pageId, label: this.label, summary: '当前 PageDesign 业务实例' },
    ]))
  }

  public resolveChild(): Promise<OperationResult<boolean>> {
    return Promise.resolve(okResult<boolean>(false))
  }

  private runAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): OperationResult<LlmJsonValue> {
    try {
      switch (this.kind) {
        case 'lifecycle':
          return serviceResultToOperationResult(this.runLifecycle(ctx, actionName, args))
        case 'text-model':
          return serviceResultToOperationResult(this.runTextModel(ctx, actionName, args))
        case 'payload-catalog':
          return serviceResultToOperationResult(runPayloadCatalogAction(actionName, args))
        case 'dataset':
          return serviceResultToOperationResult(this.runDataset(ctx, actionName, args))
        case 'node-tree':
          throw new Error('node-tree is handled by NodeTreeCapability')
      }
    } catch (error) {
      return executeErrorResult(error)
    }
  }

  private runLifecycle(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): PageDesignServiceResult<unknown> {
    const context = toServiceContext(ctx)
    switch (actionName) {
      case 'bootstrap':
        return this.service.bootstrap(context)
      case 'describeProgress':
        return this.service.describeProgress(context)
      case 'describeDesignFlow':
        return this.service.describeDesignFlow(context, toDesignFlowQuery(args))
      default:
        return unknownAction(actionName, this.kind)
    }
  }

  private runTextModel(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): PageDesignServiceResult<unknown> {
    const context = toServiceContext(ctx)
    switch (actionName) {
      case 'readScript':
        return this.service.readTextModel(context, 'script')
      case 'writeScript':
        return this.service.writeTextModel(context, 'script', readRequiredStringArg(args, 'content'))
      case 'readStyle':
        return this.service.readTextModel(context, 'style')
      case 'writeStyle':
        return this.service.writeTextModel(context, 'style', readRequiredStringArg(args, 'content'))
      default:
        return unknownAction(actionName, this.kind)
    }
  }

  private runDataset(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): PageDesignServiceResult<unknown> {
    return this.service.useDatasetMethod(
      toServiceContext(ctx),
      args,
      createMethodBinding(this.requireAction(actionName), actionName, DATASET_MUTATING_ACTION_NAMES.has(actionName)),
    )
  }

  private requireAction(actionName: string): ActionSchema {
    const action = this.actions.get(actionName)
    if (action === undefined) {
      throw new Error(`${this.kind} action is not declared: ${actionName}`)
    }
    return action
  }
}

export function createPageDesignBusinessRegistration(
  options: PageDesignModuleOptions,
): AiHostBusinessRegistration {
  const service = new PageDesignService({
    getEditHost: (context) => options.getEditToolHost({
      instanceId: context.requestId,
      moduleId: PAGE_DESIGN_MODULE_ID,
      moduleInstanceId: context.pageId,
    }),
  })
  const runtime = new ModuleSemanticRuntime()

  runtime.registerKind(new LifecycleModuleKind())
  runtime.registerKind(new TextModelModuleKind())
  runtime.registerKind(new PayloadCatalogModuleKind())
  runtime.registerKind(new NodeTreeModuleKind())
  runtime.registerKind(new DatasetModuleKind())

  runtime.registerCapability(new PageDesignActionCapability({
    kind: 'lifecycle',
    label: '当前页面生命周期',
    service,
    actions: LIFECYCLE_ACTIONS,
  }))
  runtime.registerCapability(new PageDesignActionCapability({
    kind: 'text-model',
    label: '当前页面文本模型',
    service,
    actions: TEXT_MODEL_ACTIONS,
  }))
  runtime.registerCapability(new PageDesignActionCapability({
    kind: 'payload-catalog',
    label: '当前页面组件荷载目录',
    service,
    actions: PAYLOAD_CATALOG_ACTIONS,
  }))
  runtime.registerCapability(new NodeTreeCapability({
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerCapability(new PageDesignActionCapability({
    kind: 'dataset',
    label: '当前页面数据集',
    service,
    actions: DATASET_ACTIONS,
  }))

  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    name: 'Page Design',
    description: '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。',
    runtime,
    sessionStore: new DefaultAiHostSessionStore(),
    systemPrompt: () => '你正在处理页面设计业务，支持 lifecycle、text-model、payload-catalog、node-tree、dataset 五类语义模块。',
    afterFunctionCall: (call) => {
      const unavailableMessage = pageDesignEditHostUnavailableMessage(call.result)
      if (unavailableMessage !== null) {
        return {
          status: 'abort',
          reason: 'page design edit host unavailable',
          finalAssistantMessage: unavailableMessage,
          releaseInstance: true,
        }
      }
      return { status: 'continue' }
    },
    releaseModuleInstance: (moduleInstanceId) => {
      service.releasePage(moduleInstanceId)
    },
  }
}

function toServiceContext(ctx: ModulePathContext | AiHostBusinessRuntimeContext): PageDesignServiceContext {
  if ('host' in ctx || 'segment' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment.id,
      pageId: currentPageId(pathCtx),
    }
  }
  return {
    requestId: ctx.instanceId,
    pageId: ctx.moduleInstanceId,
  }
}

function currentPageId(ctx: ModulePathContext): string {
  return ctx.host?.moduleInstanceId ?? ctx.segment.id
}

function toDesignFlowQuery(args: Readonly<Record<string, LlmJsonValue>>): { phase?: string; step?: number; afterStep?: number } {
  return {
    ...(typeof args['phase'] === 'string' ? { phase: args['phase'] } : {}),
    ...(typeof args['step'] === 'number' ? { step: args['step'] } : {}),
    ...(typeof args['afterStep'] === 'number' ? { afterStep: args['afterStep'] } : {}),
  }
}

function readRequiredStringArg(args: Readonly<Record<string, LlmJsonValue>>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`Missing required string argument: ${key}`)
  }
  return value
}

function createMethodBinding(action: ActionSchema, methodName: string, mutates: boolean): PageDesignServiceMethodBinding {
  const parts = [`参数格式: ${JSON.stringify(action.paramsSchema)}`]
  if (action.example !== undefined && isRecord(action.example) && Object.keys(action.example).length > 0) {
    parts.push(`示例: ${JSON.stringify(action.example)}`)
  }
  if (action.usageRules !== undefined && action.usageRules.length > 0) {
    parts.push(`关键规则: ${action.usageRules.join('；')}`)
  }
  return {
    serviceLabel: action.name,
    methodName,
    mutates,
    fixHint: parts.join('；'),
  }
}

function serviceResultToOperationResult(result: PageDesignServiceResult<unknown>): OperationResult<LlmJsonValue> {
  if (result.ok) {
    const data = coerceLlmJsonValue(result.data)
    return {
      ok: true,
      ...(data === undefined ? {} : { data }),
      checks: [infoCheck('OK', result.summary)],
    }
  }
  return {
    ok: false,
    checks: [errorCheck(result.code, result.msg, result.fix)],
  }
}

function executeErrorResult(error: unknown): OperationResult<LlmJsonValue> {
  const message = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    checks: [
      errorCheck(
        'EXECUTE_ERROR',
        message,
        '请先在开发系统中打开并选中目标配置页面；若已打开页面，请检查 PageDesign edit host 是否完成注册。',
      ),
    ],
  }
}

function pageDesignEditHostUnavailableMessage(result: AiHostFunctionCallResult<unknown>): string | null {
  if (result.ok || result.code !== 'EXECUTE_ERROR') return null
  const message = result.msg.trim()
  if (message === '') return null
  if (message.includes('PageDesign edit host unavailable')) return message
  if (message.includes('PageDesign edit host is not registered')) return '请先在开发系统中打开并选中目标配置页面。'
  if (message.includes('请先在开发系统中打开并选中目标配置页面')) return message
  return null
}

function unknownAction(actionName: string, kind: string): PageDesignServiceResult<never> {
  return {
    ok: false,
    code: 'UNKNOWN_ACTION',
    msg: `kind "${kind}" 不支持动作 "${actionName}"`,
    fix: `请先调用 describeKind("${kind}") 查看动作表。`,
  }
}

function coerceLlmJsonValue(value: unknown): LlmJsonValue | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const out: LlmJsonValue[] = []
    for (const item of value) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  if (typeof value === 'object') {
    const obj: Record<string, LlmJsonValue> = {}
    for (const [key, raw] of Object.entries(value)) {
      const coerced = coerceLlmJsonValue(raw)
      if (coerced !== undefined) obj[key] = coerced
    }
    return obj
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
