/**
 * PageDesign module-semantic 业务注册。
 *
 * PageDesign 只注册到 Host 一次(moduleId=pageDesign),内部暴露 1 个根 kind 和 5 个子 kind:
 * pageDesign -> lifecycle / text-model / payload-catalog / node-tree / dataset。
 *
 * LLM 固定走知识入口和执行协议工具:
 * queryModules() → queryFunctions({ kind }) → guideFunction({ functionId }) →
 * guideHumanQuestion({ context, reason, missingFacts }) when user facts are missing →
 * listChildren("/") → findInstance("/", "pageDesign", {}) →
 * listChildren("/pageDesign[<pageId>]") → describeKind(childKind) →
 * 业务函数 tool（如 pageDesign_lifecycle_describeProgress）直接调用。
 */

import {
  createAiHostBusinessScope,
  DefaultAiHostSessionStore,
  projectAiHostBusinessRegistration,
} from '@spark-view/spark-ai/host'
import type * as SparkAiHost from '@spark-view/spark-ai/host'
import {
  booleanSchema,
  enumSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from '@spark-view/spark-ai/schema'
import {
  ModuleKind,
  ModuleOperationResult,
  ModuleSemanticRuntime,
  type ModuleInstanceRef,
} from '@spark-view/spark-ai/module-semantic'
import type { ModulePathContext } from '@spark-view/spark-ai/module-semantic'
import type {
  PageDesignEditHost,
  PageDesignServiceContext,
} from '../design/page-design-host-api'
import { PageDesignService } from '../design/page-design-service'
import { PageDesignDatasetModuleKind } from './dataset-tool-catalog'
import { PageDesignLifecycleModuleKind } from './lifecycle-tool-catalog'
import { createLeaveRequestBusinessRegistration } from './leave-request'
import { PageDesignNodeTreeModuleKind } from './node-tree-tool-catalog'
import { PageDesignPayloadCatalogModuleKind } from './payload-catalog-tool-catalog'
import { PageDesignTextModelModuleKind } from './text-model-tool-catalog'
import {
  PAGE_DESIGN_CHILD_MODULES,
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_ROOT_KIND,
} from './page-design-kind-ids'

// ── 模块标识与系统提示词片段 ───────────────────────────────

export const PAGE_DESIGN_MODULE_ID = PAGE_DESIGN_ROOT_KIND

// PAGE_DESIGN_REFACTOR_SOURCE[prompt-root]: pageDesign 系统提示词唯一出处；保持小提示词，任务知识通过 lifecycle/payload-catalog 按需查询。
const AI_FUNCTION_ARCHITECTURE_PROMPT = 'pageDesign：path=/pageDesign[pageId]/<childKind>[pageId]；参数看 tools schema；写入 dataset->node-tree->text-model；组件 props 查 queryPayloads/guidePayload；失败读 code/msg/fix/checks。'

// ── 公共注册契约 ───────────────────────────────────────────

type PageDesignRuntimeContext = {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

type PageDesignModuleOptions = {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

const PAGE_DESIGN_INPUT_SCHEMA = paramsSchema({
  pageId: stringSchema('当前 pageDesign 业务实例身份。由宿主选中的页面 ID 提供，用于定位 PageDesignEditHost。', { minLength: 1 }),
  userRequirement: stringSchema('用户原始页面设计需求。作为 describeDesignFlow({ intent }) 的意图来源。', { minLength: 1 }),
  mode: enumSchema(['create', 'modify', 'fix', 'data', 'style'], '可选。任务模式：新建、改造、修 bug、补数据或调样式。'),
  allowedOperations: objectSchema({
    addTables: booleanSchema('是否允许新增 pagedata.json DataTable。'),
    addComponents: booleanSchema('是否允许新增 rule.json 节点。'),
    editScript: booleanSchema('是否允许改写 script.js。'),
    editStyle: booleanSchema('是否允许改写 style.css。'),
  }, {
    additionalProperties: false,
    description: '可选。调用方对本轮页面设计可执行操作的边界声明。',
  }),
  preserveExistingInteractions: booleanSchema('可选。是否要求保留现有页面交互和 handler。'),
}, ['pageId', 'userRequirement'], 'pageDesign AI 业务启动输入。pageId 是注册声明的实例身份字段。')

// ── pageDesign 业务装配 ────────────────────────────────────

// PAGE_DESIGN_AI_TRACE[page-design-registration]: spark-page-config 拥有 pageDesign AI 业务注册；这里把 lifecycle/text-model/payload-catalog/node-tree/dataset 五个子工具挂到 AI Host。
// PAGE_DESIGN_REFACTOR_SOURCE[page-design-registration]: pageDesign 业务注册唯一入口；mjs/前端壳只应调用注册，不复制子工具和业务规则。
/**
 * 创建 pageDesign 的 AI Host 业务注册。
 *
 * 注册结果包含一个 `ModuleSemanticRuntime`，由它投影 lifecycle、text-model、
 * payload-catalog、node-tree、dataset 五个子 kind。调用方只提供当前页面的
 * live edit host，不参与工具 schema、会话历史或业务写入规则。
 */
export function createPageDesignBusinessRegistration(
  options: PageDesignModuleOptions,
): SparkAiHost.AiHostBusinessRegistration {
  return projectAiHostBusinessRegistration(createPageDesignBusinessKindDefinition(options))
}

/**
 * 创建 pageDesign 的 kindID 定义。
 *
 * kindID 定义是 pageDesign AI 业务真源；registration 只是它投影到 Host
 * registry 的结果，task 则由它注册的 inputContract 统一校验和编排。
 */
export function createPageDesignBusinessKindDefinition(
  options: PageDesignModuleOptions,
): SparkAiHost.AiHostBusinessKindDefinition {
  const service = new PageDesignService({
    getEditHost: (context) => options.getEditToolHost({
      instanceId: context.requestId,
      moduleId: PAGE_DESIGN_MODULE_ID,
      moduleInstanceId: context.pageId,
    }),
  })
  const runtime = new ModuleSemanticRuntime()

  runtime.registerKind(new PageDesignRootModuleKind())
  runtime.registerKind(new PageDesignLifecycleModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.registerKind(new PageDesignTextModelModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.registerKind(new PageDesignPayloadCatalogModuleKind({
    parentKind: PAGE_DESIGN_ROOT_KIND,
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerKind(new PageDesignNodeTreeModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
    payloads: [
      {
        payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
        description: 'SparkNode 组件 props 参数目录；LLM 写目录组件前必须显式 guidePayload，node-tree 写入时也会按 type 自动提取指南并兜底校验 props。',
        requiredForFunctions: ['addNode', 'addNodes', 'replaceNode', 'replaceNodes', 'setProps', 'setPropsBatch'],
      },
    ],
  }))
  runtime.registerKind(new PageDesignDatasetModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))

  return {
    kindID: PAGE_DESIGN_MODULE_ID,
    name: 'Page Design',
    description: '页面四文件编辑。',
    runtime,
    inputContract: {
      paramsSchema: PAGE_DESIGN_INPUT_SCHEMA,
      identityField: 'pageId',
      normalize: normalizePageDesignBusinessInput,
      toScope: (normalizedInput) => createAiHostBusinessScope(PAGE_DESIGN_MODULE_ID, requirePageDesignInputText(normalizedInput, 'pageId')),
      toOrchestration: createPageDesignOrchestration,
    },
    sessionStore: new DefaultAiHostSessionStore(),
    systemPrompt: createPageDesignSystemPrompt,
    onStartSession: (context) => {
      const bootstrap = service.bootstrap(toServiceContext(context))
      if (!bootstrap.ok) {
        throw new Error(bootstrap.msg)
      }
    },
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

function normalizePageDesignBusinessInput(
  input: SparkAiHost.AiHostBusinessTaskInput,
): SparkAiHost.AiHostBusinessTaskInput {
  const normalized: Record<string, SparkAiHost.AiHostBusinessTaskInput[string]> = { ...input }
  normalized['pageId'] = requirePageDesignInputText(input, 'pageId')
  normalized['userRequirement'] = requirePageDesignInputText(input, 'userRequirement')
  const mode = input['mode']
  if (typeof mode === 'string') normalized['mode'] = mode.trim()
  return normalized
}

function createPageDesignOrchestration(
  input: SparkAiHost.AiHostBusinessTaskInput,
): SparkAiHost.AiHostBusinessOrchestrationPlan {
  const pageId = requirePageDesignInputText(input, 'pageId')
  const userRequirement = requirePageDesignInputText(input, 'userRequirement')
  return {
    title: 'pageDesign registered task orchestration',
    userMessage: userRequirement,
    systemPrompt: [
      `首轮仅 tool_call：findInstance({"path":"/","childKind":"pageDesign","query":{"id":"${pageId}"}})。无正文；Host 返回 ref.id 后：调用 pageDesign_lifecycle_describeProgress({ $paths: [ref.id, ref.id] }) -> pageDesign_lifecycle_describeDesignFlow({ $paths: [ref.id, ref.id], intent: messages[0].content })。`,
    ].join('\n'),
    readonlySteps: [
      'find current pageDesign instance',
      'describeProgress',
      'describeDesignFlow with userRequirement intent',
      'guideHumanQuestion before guessing missing business facts',
    ],
  }
}

function requirePageDesignInputText(
  input: SparkAiHost.AiHostBusinessTaskInput,
  fieldName: 'pageId' | 'userRequirement',
): string {
  const value = input[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`pageDesign input.${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

// ── System Prompt 组装 ─────────────────────────────────────

function createPageDesignSystemPrompt(): string {
  return AI_FUNCTION_ARCHITECTURE_PROMPT
}

// ── 根 ModuleKind 与实例发现 ───────────────────────────────

class PageDesignRootModuleKind extends ModuleKind {
  public constructor() {
    super({
      kind: PAGE_DESIGN_ROOT_KIND,
      name: 'Page Design',
      description: '单页面四文件编辑根模块，子模块负责 lifecycle、文本模型、组件荷载、节点树和数据集。',
      children: PAGE_DESIGN_CHILD_MODULES.map((item) => item.kind),
      list: (ctx, childKind) => ModuleOperationResult.ok(childModuleRefs(ctx, childKind)),
      find: (ctx, childKind) => {
        if (childKind === PAGE_DESIGN_ROOT_KIND && ctx.segments.length === 0) {
          const ref = createCurrentPageDesignRef(ctx)
          return ModuleOperationResult.ok(ref === null ? [] : [ref])
        }
        return ModuleOperationResult.ok(childModuleRefs(ctx, childKind))
      },
    })
  }
}

function createCurrentPageDesignRef(ctx: ModulePathContext): ModuleInstanceRef | null {
  const pageId = pageDesignPageId(ctx)
  if (pageId === null) return null
  return {
    id: pageId,
    label: '当前页面设计业务',
    summary: 'PageDesign 根模块实例。',
  }
}

function childModuleRefs(ctx: ModulePathContext, childKind?: string): readonly ModuleInstanceRef[] {
  const pageId = pageDesignPageId(ctx)
  if (pageId === null) return []
  return PAGE_DESIGN_CHILD_MODULES
    .filter((item) => childKind === undefined || item.kind === childKind)
    .map((item) => ({
      id: pageId,
      label: item.label,
      summary: `${item.kind}: ${item.summary}`,
    }))
}

function pageDesignPageId(ctx: ModulePathContext): string | null {
  const pageId = ctx.host?.moduleInstanceId ?? ctx.segment.id
  return pageId.length === 0 ? null : pageId
}

// ── Host 上下文转换与生命周期错误映射 ─────────────────────

function toServiceContext(ctx: ModulePathContext | SparkAiHost.AiHostBusinessRuntimeContext): PageDesignServiceContext {
  if ('host' in ctx || 'segment' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment.id,
      pageId: pathCtx.host?.moduleInstanceId ?? pathCtx.segment.id,
    }
  }
  return {
    requestId: ctx.instanceId,
    pageId: ctx.moduleInstanceId,
  }
}

function pageDesignEditHostUnavailableMessage(result: SparkAiHost.AiHostFunctionCallResult<unknown>): string | null {
  if (result.ok || (result.code !== 'EXECUTE_ERROR' && result.code !== 'ACTION_EXECUTE_ERROR')) return null
  const message = result.msg.trim()
  if (message === '') return null
  if (message.includes('PageDesign edit host unavailable')) return message
  if (message.includes('PageDesign edit host is not registered')) return '请先在开发系统中打开并选中目标配置页面。'
  if (message.includes('请先在开发系统中打开并选中目标配置页面')) return message
  return null
}

// ── 公共注册门面 ───────────────────────────────────────────

type RegisterAssistantBusinessesOptions = {
  readonly registry: SparkAiHost.AiHostBusinessRegistry
  readonly getPageDesignEditHost?: (context: SparkAiHost.AiHostBusinessRuntimeContext) => PageDesignEditHost
}

type RegisterPageDesignBusinessOptions = {
  readonly registry: SparkAiHost.AiHostBusinessRegistry
  readonly getPageDesignEditHost: (context: SparkAiHost.AiHostBusinessRuntimeContext) => PageDesignEditHost
}

/**
 * 将 pageDesign 注册到传入的 AI Host registry。
 *
 * 这是 smoke、前端壳和其它宿主应使用的窄入口；具体业务规则必须继续留在
 * pageDesign 的 ModuleKind / PageDesignService 内。
 */
export function registerPageDesignBusiness(options: RegisterPageDesignBusinessOptions): void {
  options.registry.register(createPageDesignBusinessRegistration({
    getEditToolHost: (context) => options.getPageDesignEditHost(context),
  }))
}

/**
 * 兼容旧 assistant business 注册入口。
 *
 * leave-request 仍按历史业务注册；pageDesign 只有在宿主提供 live edit host 时注册。
 */
export function registerAssistantBusinesses(options: RegisterAssistantBusinessesOptions): void {
  options.registry.register(createLeaveRequestBusinessRegistration())

  if (options.getPageDesignEditHost === undefined) return

  registerPageDesignBusiness({
    registry: options.registry,
    getPageDesignEditHost: options.getPageDesignEditHost,
  })
}
