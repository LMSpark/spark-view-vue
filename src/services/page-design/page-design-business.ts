/**
 * @module app:services/page-design-business
 * 职责：提供应用运行时 service 层的 page design business 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * pageDesign AI business registration.
 *
 * This app-layer service exposes the current ProjectModel to spark-ai without
 * making spark-project-model depend on AI runtime or generated metadata files.
 */
import {
  createSimpleInputContract,
  ClassModelAgentAdapter,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
  type AiAgentToolLoopNudgeReason,
} from '@/services/ai/spark-ai-agent-bindings'
import {
  WorkerClassModelKnowledgeProvider,
  CLASS_MODEL_TOOL_NAMES,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  evaluatePageDesignMutationToolGate,
  isPageDesignDataSetOnlyMode,
  readPageDesignRunContext,
  type PageDesignAllowedOperations,
  type PageDesignRunMode,
} from '@/services/page-design/page-design-gates'
import { dtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

export type { PageDesignAllowedOperations, PageDesignRunMode }

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

const PAGE_DESIGN_ROOT_CLASS_NAME = 'ProjectModel'

/** pageDesign SOP：toolLoopNudge 触发时机与 pageId / allowedOperations 上下文。 */
export function buildPageDesignToolLoopNudge(
  reason: AiAgentToolLoopNudgeReason,
  pageId: string,
  allowedOperations?: PageDesignAllowedOperations,
): string | undefined {
  if (isPageDesignDataSetOnlyMode(allowedOperations)) {
    switch (reason) {
      case 'plan_without_tool':
        return `pageId="${pageId}"；pageDataDesign preset：禁止只输出计划，下一回合必须 model_script 调用 editDataSet。`
      case 'execution_phase':
        return `pageId="${pageId}"；只改 pagedata.json：await this.openPageDesign({ pageId: "${pageId}" }).editDataSet(tool => …)；禁止 nodeTree / setFileText 变更。`
      case 'model_script_retry':
        return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script，仍只通过 editDataSet 变更 DataSet。`
      default:
        return undefined
    }
  }
  switch (reason) {
    case 'plan_without_tool':
      return `pageId="${pageId}"；禁止只输出计划，下一回合必须发起 tool_call（见 model_action_guide / RECOVERY_HINT）。`
    case 'execution_phase':
      return `pageId="${pageId}"；目录/指南阶段已完成，直接 model_script。`
    case 'model_script_retry':
      return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script。`
    default:
      return undefined
  }
}

function createPageDesignClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  if (typeof Worker === 'undefined') {
    throw new Error('DTS ClassModel knowledge requires Web Worker on-demand loading.')
  }

  const worker = new Worker(
    new URL('../class-model-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerClassModelKnowledgeProvider(worker, {
    dtsClassModelManifestUrl,
    rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
  })
}

/** Page Design Run Input 的输入数据。 */
export type PageDesignRunInput = {
    /** page Id 标识。 */
pageId: string
    /** description 字段。 */
description: string
  /** readPlanningProjection 的 effectiveDescription；runner 必填。 */
  effectiveDescription: string
  /** 项目根 path 段 id；用于 systemPrompt 给出 concrete /project[id] 示例。 */
  projectId?: string
    /** planning Title 字段。 */
planningTitle?: string
    /** planning Path 路径。 */
planningPath?: string
    /** mode 字段。 */
mode?: PageDesignRunMode
    /** allowed Operations 字段。 */
allowedOperations?: PageDesignAllowedOperations
    /** preserve Existing Interactions 字段。 */
preserveExistingInteractions?: boolean
  /** 未声明 implGate 时 fail-fast；生产 runner 建议 true。 */
  strictImplGate?: boolean
}

/** Resolve Page Design Planning Context Options 的调用配置。 */
export type ResolvePageDesignPlanningContextOptions = {
  /** 仅 e2e/脚手架：投影为空时用本轮 description 兜底。生产 runner 勿传。 */
  fallbackDescription?: string
}

/** Ensure Page Design Business Options 的调用配置。 */
export type EnsurePageDesignBusinessOptions = {
    /** 宿主运行时信息。 */
host: AiAgentHost
    /** get Page Design Editor 回调。 */
getPageDesignEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}


export function resolvePageDesignPlanningContext(
  project: ProjectModel,
  pageId: string,
  options: ResolvePageDesignPlanningContextOptions = {},
): Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'> {
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    throw new Error(`pageDesign: no planning projection for pageId "${pageId}".`)
  }
  let effectiveDescription = summary.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    const fallback = options.fallbackDescription?.trim() ?? ''
    if (fallback.length === 0) {
      throw new Error(
        `pageDesign: page "${pageId}" has empty effectiveDescription; set navigation description before AI run.`,
      )
    }
    effectiveDescription = fallback
  }
  const planningTitle = summary.title.trim()
  const planningPath = summary.path.trim()
  return {
    effectiveDescription,
    planningTitle: planningTitle.length > 0 ? planningTitle : pageId,
    planningPath: planningPath.length > 0 ? planningPath : `/${pageId}`,
  }
}

export function ensurePageDesignBusiness(options: EnsurePageDesignBusinessOptions): AiAgentHost {
  return options.host.ensure(PAGE_DESIGN_MODULE_ID, {
    moduleId: PAGE_DESIGN_MODULE_ID,
    create: () => ClassModelAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      options: {
        moduleId: PAGE_DESIGN_MODULE_ID,
        rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
        dtsClassModelManifestUrl,
        knowledge: createPageDesignClassModelKnowledgeProvider(),
        inputContract: createSimpleInputContract<PageDesignRunInput>({
          businessId: PAGE_DESIGN_MODULE_ID,
          identityField: 'pageId',
          messageField: 'description',
          paramsSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
              description: { type: 'string' },
              effectiveDescription: { type: 'string' },
              projectId: { type: 'string' },
              planningTitle: { type: 'string' },
              planningPath: { type: 'string' },
              mode: { type: 'string', enum: ['create', 'update', 'fix'] },
              allowedOperations: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  nodeTree: { type: 'boolean' },
                  dataSet: { type: 'boolean' },
                  script: { type: 'boolean' },
                  style: { type: 'boolean' },
                  navigation: { type: 'boolean' },
                },
              },
              preserveExistingInteractions: { type: 'boolean' },
              strictImplGate: { type: 'boolean' },
            },
            required: ['pageId', 'description', 'effectiveDescription'],
            additionalProperties: false,
          },
          systemPrompt: createPageDesignSystemPrompt,
          title: input => `pageDesign:${input.pageId}`,
          readonlySteps: [
            '策划约束已注入 effectiveDescription（来自 readPlanningProjection）。',
            '业务契约见 ClassModel 知识索引（model_query / model_class_guide / model_action_guide）。',
          ],
        }),
        resolveInstance: ctx => resolvePageDesignProject(options, ctx),
        beforeFunctionCall: (instance, hookOptions) => evaluatePageDesignBeforeFunctionCall(
          instance,
          hookOptions,
        ),
        executionToolNames: PAGE_DESIGN_EXECUTION_TOOL_NAMES,
        planWithoutToolMarkers: PAGE_DESIGN_PLAN_WITHOUT_TOOL_MARKERS,
        toolLoopNudge: createPageDesignToolLoopNudge,
      },
    }),
  })
}

const PAGE_DESIGN_EXECUTION_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.script,
])

const PAGE_DESIGN_PLAN_WITHOUT_TOOL_MARKERS = [
  'openpagedesign',
  'editnodetree',
  'editdataset',
] as const

function createPageDesignToolLoopNudge(context: AiAgentToolLoopNudgeContext): string | undefined {
  const pageId = context.moduleInstanceId.trim()
  if (pageId.length === 0) return undefined
  const runContext = readPageDesignRunContext(pageId)
  return buildPageDesignToolLoopNudge(
    context.reason,
    pageId,
    runContext?.allowedOperations,
  )
}

/** 供 inputContract 与单测使用的 systemPrompt 格式化。 */
export function formatPageDesignSystemPrompt(input: PageDesignRunInput): string {
  const effectiveDescription = input.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    throw new Error('pageDesign systemPrompt requires effectiveDescription from readPlanningProjection.')
  }
  const planningTitle = input.planningTitle?.trim() ?? input.pageId
  const planningPath = input.planningPath?.trim() ?? `/${input.pageId}`
  const projectId = input.projectId?.trim() ?? 'homepage'
  const sharedHeader = [
    `projectId=${projectId}；pageId=${input.pageId}。`,
    '策划约束（readPlanningProjection.effectiveDescription）:',
    effectiveDescription,
    `用户本轮目标: ${input.description}`,
  ]
  if (isPageDesignDataSetOnlyMode(input.allowedOperations)) {
    return [
      `当前 pageDataDesign preset（pageDesign 数据域）: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
      ...sharedHeader,
      '能力边界: 只修改 pagedata.json（DataSet）；禁止 editNodeTree、rule.json、script.js、style.css。',
      '知识索引: DTS ClassModel（ProjectModel → openPageDesign → editDataSet / DataSetCrudTool）。',
      '执行规则: 先 model_action_guide 查 editDataSet 与 DataSetCrudTool，再 model_script 通过 editDataSet 回调变更表/视图/绑定。',
      '交付: 仅 commit pagedata.json；nodeTree / rule / script / style 即使 dirty 也不落盘。',
      '模型来源: generated/dts-class-model。',
    ].join('\n')
  }
  return [
    `当前 pageDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    ...sharedHeader,
    '知识索引: DTS ClassModel（ProjectModel → ConfigPageNode）；用 model_query / model_action_guide 读取契约后 model_script 执行。',
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function createPageDesignSystemPrompt(input: PageDesignRunInput): string {
  return formatPageDesignSystemPrompt(input)
}

function resolvePageDesignProject(
  options: EnsurePageDesignBusinessOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId
  if (moduleInstanceId.trim().length === 0) {
    throw new Error('pageDesign ProjectModel requires host.moduleInstanceId.')
  }
  const host = options.getPageDesignEditor({ moduleInstanceId })
  host.project.openPageDesign(moduleInstanceId)
  return host.project
}

export {
  assertPageDesignRunGateAllowed,
  evaluatePageDesignMutationToolGate,
  readPageDesignGateState,
  validatePageDesignRunGate,
} from '@/services/page-design/page-design-gates'

export type {
  PageDesignGateState,
  PageDesignGateValidationResult,
  PageDesignImplGate,
} from '@/services/page-design/page-design-gates'

function evaluatePageDesignBeforeFunctionCall(
  project: ProjectModel,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const pageId = options.moduleInstanceId.trim()
  if (pageId.length === 0) {
    return { status: 'allow' }
  }
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    return {
      status: 'reject',
      reason: `pageDesign: no planning projection for pageId "${pageId}".`,
      fix: '先 readPlanningProjection，确认 pageId 存在于 pageFeatures。',
    }
  }
  const runContext = readPageDesignRunContext(pageId)
  const gate = evaluatePageDesignMutationToolGate({
    toolName: options.toolName,
    summary,
    ...(runContext?.allowedOperations === undefined
      ? {}
      : { allowedOperations: runContext.allowedOperations }),
    toolArgs: options.args,
  })
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'pageDesign gate rejected mutation tool.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}
