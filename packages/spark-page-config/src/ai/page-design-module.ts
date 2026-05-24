/**
 * PageDesign module-semantic 业务注册。
 *
 * PageDesign 只注册到 Host 一次(moduleId=pageDesign),内部暴露 1 个根 kind 和 5 个子 kind:
 * pageDesign -> lifecycle / text-model / payload-catalog / node-tree / dataset。
 *
 * LLM 固定走 6 个协议工具:
 * listChildren("/") → findInstance("/", "pageDesign", {}) →
 * listChildren("/pageDesign[<pageId>]") → describeKind(childKind) →
 * invokeAction("/pageDesign[<pageId>]/<childKind>[<pageId>]", actionName, args)。
 */

import {
  DefaultAiHostSessionStore,
  type AiHostBusinessRegistration,
  type AiHostBusinessRegistry,
  type AiHostBusinessRuntimeContext,
  type AiHostFunctionCallResult,
} from '@spark-view/spark-ai/host'
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
const AI_FUNCTION_ARCHITECTURE_PROMPT = `══ AI Host: module-semantic boundary ══

  - Host 只暴露 6 个稳定协议工具：listChildren、findInstance、describeKind、invokeAction、getAttribute、setAttribute。
  - 当前业务根 kind 是 pageDesign，子 kind 是 lifecycle / text-model / payload-catalog / node-tree / dataset。
  - 先用 listChildren("/") 发现 pageDesign，再用 findInstance("/", "pageDesign", {}) 取得当前业务实例。
  - 子模块发现使用 listChildren("/pageDesign[<当前页面ID>]") 或 findInstance("/pageDesign[<当前页面ID>]", childKind, {})。
  - 调用业务动作统一使用 invokeAction(path, actionName, args)，推荐路径形如 /pageDesign[<当前页面ID>]/<childKind>[<当前页面ID>]。
  - 子模块路径必须带实例段：正确 /pageDesign[page-a]/lifecycle[page-a]，错误 /pageDesign[page-a]/lifecycle。
  - AI 会话宿主负责模型通讯、tool schema 投影、函数选择、重试、追问、暂停与恢复。
  - Host 负责 AI 会话记录、协议工具调用记录和执行结果回传给 LLM。
  - 调用链路是：pageDesign 业务注册 -> Host 会话 -> LLM 编排协议工具 -> ModuleSemanticRuntime 路由 -> pageDesign ModuleKind 协议方法执行。
  - AI 会话按根 kind + 当前根页面实体 ID 隔离，后端 sessionId 由 Host 生成。
  - ModuleSemanticRuntime 不保存 active path 业务状态，也不依据函数结果做下一步编排。
  - 模块服务自管生命周期与 live state；业务 release 只清 live state，不删除会话历史。
  - instanceId 是当前根页面实体 ID，不进入函数 args，也不由 LLM 自行拼接 sessionId。`

const PAGE_DESIGN_COMMON_COMPONENT_PROMPT = `══ pageDesign: 组件参数荷载指南纪律 ══

  - 不要把 VCM/component-catalog 构建产物整包放进上下文；组件目录只能通过 payload-catalog 按需查询。
  - 不确定组件 type 时先 queryPayloads；确定 type 后再 guidePayload({ key:type })。
  - 写目录组件前必须显式 guidePayload；node-tree 会兜底校验 props，返回 ok:false 时按 code/msg/fix/checks 修正后重试。
  - 标准 HTML 标签不需要 guidePayload；目录外未知业务组件会被 node-tree 拦截。`

const PAGE_DESIGN_KNOWLEDGE_DISCOVERY_PROMPT = `══ pageDesign: 知识查询纪律 ══

  - 不要从 system prompt 猜业务模板；先通过 lifecycle.describeDesignFlow({ intent: 用户原话 }) 查询任务知识。
  - 先数据策划，再 UI：pagedata.json 的表、字段、view、聚合事实确定后，才能写 rule.json。
  - describeKind 只用于查看 kind/action/payload 引用；具体函数参数以 describeKind 返回的 paramsSchema 和工具错误校验为准。`

// ── 公共注册契约 ───────────────────────────────────────────

type PageDesignRuntimeContext = {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

type PageDesignModuleOptions = {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

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
): AiHostBusinessRegistration {
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
        requiredForActions: ['addNode', 'addNodes', 'replaceNode', 'replaceNodes', 'setProps', 'setPropsBatch'],
      },
    ],
  }))
  runtime.registerKind(new PageDesignDatasetModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))

  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    name: 'Page Design',
    description: '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。',
    runtime,
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

// ── System Prompt 组装 ─────────────────────────────────────

function createPageDesignSystemPrompt(): string {
  return `${AI_FUNCTION_ARCHITECTURE_PROMPT}

${PAGE_DESIGN_COMMON_COMPONENT_PROMPT}

${PAGE_DESIGN_KNOWLEDGE_DISCOVERY_PROMPT}

══ pageDesign: 执行纪律 ══

  - 当前上下文是真实页面四文件：pagedata.json / rule.json / script.js / style.css。
  - 对实现/创建/设计页面类请求，必须通过 FC 写入 dataset / node-tree / text-model；未写入不要宣称完成。
  - 首轮优先只读查询：describeProgress、describeDesignFlow({ intent: 用户原话 })、必要时读取当前数据/节点状态。
  - 一旦判断下一步需要读写或校验，当前响应必须直接发 tool_call；不要只输出“先创建/接下来/现在开始”等过渡文本。
  - 修改 pagedata.json 使用 dataset；修改 rule.json 使用 node-tree；修改 script/style 使用 text-model。
  - 复杂参数不要猜：先 describeKind 查看 action schema；组件 props 先 queryPayloads/guidePayload。
  - 返回 ok:false 时，读取 code/msg/fix/checks，并用下一次 FC 修正。
  - 完成必要写入后停止工具调用并简短总结。`
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

function toServiceContext(ctx: ModulePathContext | AiHostBusinessRuntimeContext): PageDesignServiceContext {
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

function pageDesignEditHostUnavailableMessage(result: AiHostFunctionCallResult<unknown>): string | null {
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
  readonly registry: AiHostBusinessRegistry
  readonly getPageDesignEditHost?: (context: AiHostBusinessRuntimeContext) => PageDesignEditHost
}

type RegisterPageDesignBusinessOptions = {
  readonly registry: AiHostBusinessRegistry
  readonly getPageDesignEditHost: (context: AiHostBusinessRuntimeContext) => PageDesignEditHost
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
