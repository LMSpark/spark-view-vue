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
  ModuleKind,
  ModuleSemanticRuntime,
  ok,
  type ActionSchema,
  type ModuleInstanceFinder,
  type ModuleInstanceRef,
  type ModuleKindRunner,
  type ModulePathContext,
  type OperationResult,
} from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'
import {
  PageDesignService,
  type PageDesignServiceContext,
  type PageDesignServiceResult,
} from '../../../page/workspace/services/page-design-service'
import type { PageDesignEditHost } from '../../../page/workspace/editing/page-design-edit-session'
import { DATASET_ACTIONS, createDatasetActionBinding } from './modules/dataset-tool-catalog'
import { LIFECYCLE_ACTIONS } from './modules/lifecycle-tool-catalog'
import { PAYLOAD_CATALOG_ACTIONS, PAYLOAD_CATALOG_ACTION_RUNNERS, isPayloadCatalogFunctionId } from './modules/payload-catalog-tool-catalog'
import { TEXT_MODEL_ACTIONS } from './modules/text-model-tool-catalog'
import { createNodeTreeModuleKind } from './module-semantic'
import { serviceResultToOperationResult } from '../module-semantic-service-result'

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

interface PageDesignActionModuleKindOptions {
  readonly kind: Exclude<PageDesignModuleKindId, 'node-tree'>
  readonly name: string
  readonly description: string
  readonly label: string
  readonly service: PageDesignService
  readonly actions: readonly ActionSchema[]
}

/**
 * @moduleFactory createPageDesignActionModuleKind
 * @moduleRunner createPageDesignRunnerDelegate
 * @moduleFindDelegate createPageDesignFindDelegate
 */
function createPageDesignActionModuleKind(options: PageDesignActionModuleKindOptions): ModuleKind {
  const actionByName = new Map(options.actions.map((action) => [action.name, action]))
  return new ModuleKind({
    kind: options.kind,
    name: options.name,
    description: options.description,
    actions: options.actions,
    children: [],
    runner: createPageDesignRunnerDelegate(options.service, options.kind, actionByName),
    find: createPageDesignFindDelegate(options.kind, options.label),
  })
}

function createPageDesignRunnerDelegate(
  service: PageDesignService,
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
): ModuleKindRunner {
  return (ctx, actionName, args) => runPageDesignAction(service, kind, actionByName, ctx, actionName, args)
}

function createPageDesignFindDelegate(
  kind: PageDesignActionModuleKindOptions['kind'],
  label: string,
): ModuleInstanceFinder {
  return (ctx, childKind, query) => {
    void query
    if (childKind !== kind || ctx.segments.length !== 0) {
      return ok<readonly ModuleInstanceRef[]>([])
    }
    const ref = createCurrentPageRef(ctx, label)
    return ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
  }
}

function createCurrentPageRef(ctx: ModulePathContext, label: string): ModuleInstanceRef | null {
  const pageId = currentPageId(ctx)
  if (pageId.length === 0) {
    return null
  }
  return { id: pageId, label, summary: '当前 PageDesign 业务实例' }
}

async function runPageDesignAction(
  service: PageDesignService,
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): Promise<OperationResult<LlmJsonValue>> {
  switch (kind) {
    case 'lifecycle':
      return runLifecycleAction(service, kind, actionByName, ctx, actionName, args)
    case 'text-model':
      return runTextModelAction(service, kind, actionByName, ctx, actionName, args)
    case 'payload-catalog':
      return runPayloadCatalogAction(kind, actionByName, actionName, args)
    case 'dataset':
      return serviceResultToOperationResult(await runDatasetAction(service, kind, actionByName, ctx, actionName, args))
  }
}

function runLifecycleAction(
  service: PageDesignService,
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): OperationResult<LlmJsonValue> {
  requirePageDesignAction(kind, actionByName, actionName)
  switch (actionName) {
    case 'bootstrap':
      return serviceResultToOperationResult(service.bootstrap(toServiceContext(ctx)))
    case 'describeProgress':
      return serviceResultToOperationResult(service.describeProgress(toServiceContext(ctx)))
    case 'describeDesignFlow':
      return serviceResultToOperationResult(service.describeDesignFlow(toServiceContext(ctx), toDesignFlowQuery(args)))
    default:
      throw new Error(`${kind} action runner is not registered: ${actionName}`)
  }
}

function runTextModelAction(
  service: PageDesignService,
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): OperationResult<LlmJsonValue> {
  requirePageDesignAction(kind, actionByName, actionName)
  switch (actionName) {
    case 'readScript':
      return serviceResultToOperationResult(service.readTextModel(toServiceContext(ctx), 'script'))
    case 'writeScript':
      return serviceResultToOperationResult(service.writeTextModel(toServiceContext(ctx), 'script', readRequiredStringArg(args, 'content')))
    case 'readStyle':
      return serviceResultToOperationResult(service.readTextModel(toServiceContext(ctx), 'style'))
    case 'writeStyle':
      return serviceResultToOperationResult(service.writeTextModel(toServiceContext(ctx), 'style', readRequiredStringArg(args, 'content')))
    default:
      throw new Error(`${kind} action runner is not registered: ${actionName}`)
  }
}

function runPayloadCatalogAction(
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): OperationResult<LlmJsonValue> {
  requirePageDesignAction(kind, actionByName, actionName)
  if (!isPayloadCatalogFunctionId(actionName)) {
    throw new Error(`payload-catalog action runner is not registered: ${actionName}`)
  }
  return serviceResultToOperationResult(PAYLOAD_CATALOG_ACTION_RUNNERS[actionName](args))
}

async function runDatasetAction(
  service: PageDesignService,
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): Promise<PageDesignServiceResult<unknown>> {
  const action = requirePageDesignAction(kind, actionByName, actionName)
  return service.runDatasetAction(
    toServiceContext(ctx),
    args,
    createDatasetActionBinding(action),
  )
}

function requirePageDesignAction(
  kind: PageDesignActionModuleKindOptions['kind'],
  actionByName: ReadonlyMap<string, ActionSchema>,
  actionName: string,
): ActionSchema {
  const action = actionByName.get(actionName)
  if (action === undefined) {
    throw new Error(`${kind} action is not declared: ${actionName}`)
  }
  return action
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

  runtime.registerKind(createPageDesignActionModuleKind({
    kind: 'lifecycle',
    name: 'Page Design Lifecycle',
    description: '页面设计编辑运行态引导与进度查询。',
    label: '当前页面生命周期',
    service,
    actions: LIFECYCLE_ACTIONS,
  }))
  runtime.registerKind(createPageDesignActionModuleKind({
    kind: 'text-model',
    name: 'Page Design Text Model',
    description: '当前页面 script.js/style.css live 文本模型读写。',
    label: '当前页面文本模型',
    service,
    actions: TEXT_MODEL_ACTIONS,
  }))
  runtime.registerKind(createPageDesignActionModuleKind({
    kind: 'payload-catalog',
    name: 'Page Design Payload Catalog',
    description: '当前页面设计组件参数荷载知识查询。',
    label: '当前页面组件荷载目录',
    service,
    actions: PAYLOAD_CATALOG_ACTIONS,
  }))
  runtime.registerKind(createNodeTreeModuleKind({
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerKind(createPageDesignActionModuleKind({
    kind: 'dataset',
    name: 'Page Design DataSet',
    description: '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。',
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

function pageDesignEditHostUnavailableMessage(result: AiHostFunctionCallResult<unknown>): string | null {
  if (result.ok || (result.code !== 'EXECUTE_ERROR' && result.code !== 'ACTION_EXECUTE_ERROR')) return null
  const message = result.msg.trim()
  if (message === '') return null
  if (message.includes('PageDesign edit host unavailable')) return message
  if (message.includes('PageDesign edit host is not registered')) return '请先在开发系统中打开并选中目标配置页面。'
  if (message.includes('请先在开发系统中打开并选中目标配置页面')) return message
  return null
}
