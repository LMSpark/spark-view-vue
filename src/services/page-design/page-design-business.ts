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
  activateAgentWorkflowDefinition,
  createSimpleInputContract,
  ClassModelAgentAdapter,
  type AgentWorkflowDefinition,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
  type AiAgentToolLoopNudgeReason,
} from '@/services/ai/spark-ai-agent-bindings'
import {
  CLASS_MODEL_TOOL_NAMES,
  createWorkerDtsClassModelKnowledgeProvider,
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
import { getDtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

export type { PageDesignAllowedOperations, PageDesignRunMode }

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

const PAGE_DESIGN_ROOT_CLASS_NAME = 'ProjectModel'
const PAGE_DESIGN_WORKFLOW_ID = 'agent.workflow.pageDesign'
const PAGE_DESIGN_REGISTRATION_BINDING_KEY = 'pageDesign.registration'
const PAGE_DESIGN_WORKFLOW_PUBLISHED_AT = '1970-01-01T00:00:00.000Z'

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
        return `pageId="${pageId}"；只改 pagedata.json：const page = this.openPageDesign("${pageId}"); await page.editDataSet(async tool => …)；禁止 nodeTree / setFileText 变更。script 只写函数体，不要包 async function/function。`
      case 'model_script_retry':
        return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script，仍只通过 const page = this.openPageDesign("${pageId}"); await page.editDataSet(async tool => …) 变更 DataSet。`
      default:
        return undefined
    }
  }
  switch (reason) {
    case 'plan_without_tool':
      return `pageId="${pageId}"；禁止只输出计划，下一回合必须发起真实 tool_call。优先查询 model_action_guide({ kind: "ProjectModel", actionName: "openPageDesign" })，然后进入 model_script。`
    case 'execution_phase':
      return `pageId="${pageId}"；目录/指南阶段已完成，直接 model_script：script 只写函数体，不要包 async function/function；const page = this.openPageDesign("${pageId}"); 通过 page.setFileText("pagedata.json"|"rule.json"|"script.js"|"style.css", text) 写入四文件。`
    case 'model_script_retry':
      return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script；script 只写函数体，不要包 async function/function；openPageDesign 接收字符串 pageId，不是对象。`
    default:
      return undefined
  }
}

function createPageDesignClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
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
  /** Node/E2E 可注入非 Worker knowledge provider；浏览器生产默认使用 Worker provider。 */
  knowledge?: ClassModelKnowledgeProvider
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
  return activateAgentWorkflowDefinition({
    host: options.host,
    definition: createPageDesignAgentWorkflowDefinition(),
    bindings: {
      registrations: {
        [PAGE_DESIGN_REGISTRATION_BINDING_KEY]: {
          moduleId: PAGE_DESIGN_MODULE_ID,
          create: () => createPageDesignRegistration(options),
        },
      },
    },
  })
}

export function createPageDesignAgentWorkflowDefinition(): AgentWorkflowDefinition {
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: PAGE_DESIGN_WORKFLOW_ID,
    source: {
      designKind: 'agent.workflow.design',
      designId: PAGE_DESIGN_WORKFLOW_ID,
      designVersion: 1,
    },
    factory: {
      identity: {
        phaseId: 'F0',
        phase: 'identity',
        sectionPath: 'factory.identity',
        publishPath: 'workflow.factory.identity',
        value: {
          alias: PAGE_DESIGN_MODULE_ID,
          moduleId: PAGE_DESIGN_MODULE_ID,
          rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
        },
      },
      materials: {
        phaseId: 'F1',
        phase: 'materials',
        sectionPath: 'factory.materials',
        publishPath: 'workflow.factory.materials',
        value: {
          moduleClass: 'ProjectModel',
          editorResolver: 'getPageDesignEditor',
        },
      },
      knowledge: {
        phaseId: 'F2',
        phase: 'knowledge',
        sectionPath: 'factory.knowledge',
        publishPath: 'workflow.factory.knowledge',
        value: {
          rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
          provider: 'dtsClassModelWorker',
        },
      },
      contract: {
        phaseId: 'F3',
        phase: 'contract',
        sectionPath: 'factory.contract',
        publishPath: 'workflow.factory.contract',
        value: {
          identityField: 'pageId',
          messageField: 'description',
        },
      },
      runtime: {
        phaseId: 'F4',
        phase: 'runtime',
        sectionPath: 'factory.runtime',
        publishPath: 'workflow.factory.runtime',
        value: {
          adapter: 'ClassModelAgentAdapter',
          executionToolNames: [CLASS_MODEL_TOOL_NAMES.script],
        },
      },
      governance: {
        phaseId: 'F5',
        phase: 'governance',
        sectionPath: 'factory.governance',
        publishPath: 'workflow.factory.governance',
        value: {
          beforeFunctionCall: 'pageDesignMutationToolGate',
          toolLoopNudge: 'pageDesign',
        },
      },
      acceptance: {
        phaseId: 'F6',
        phase: 'acceptance',
        sectionPath: 'factory.acceptance',
        publishPath: 'workflow.factory.acceptance',
        value: {
          dryRun: true,
          inspectFactory: true,
        },
      },
      activation: {
        phaseId: 'F7',
        phase: 'activation',
        sectionPath: 'factory.activation',
        publishPath: 'workflow.factory.activation',
        value: {
          registrationBindingKey: PAGE_DESIGN_REGISTRATION_BINDING_KEY,
        },
      },
      workOrder: {
        phaseId: 'F8',
        phase: 'workOrder',
        sectionPath: 'factory.workOrder',
        publishPath: 'workflow.factory.workOrder',
        value: {
          hostRunAlias: PAGE_DESIGN_MODULE_ID,
        },
      },
      delivery: {
        phaseId: 'F9',
        phase: 'delivery',
        sectionPath: 'factory.delivery',
        publishPath: 'workflow.factory.delivery',
        value: {
          mode: 'appDeliveryPort',
          owner: 'pageDesignHostRunProvider',
        },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: PAGE_DESIGN_WORKFLOW_PUBLISHED_AT,
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function createPageDesignRegistration(options: EnsurePageDesignBusinessOptions) {
  return ClassModelAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      options: {
        moduleId: PAGE_DESIGN_MODULE_ID,
        rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
        dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
        knowledge: options.knowledge ?? createPageDesignClassModelKnowledgeProvider(),
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
      '工具参数: model_query 只用 kind / keyword / includeMembers；model_action_guide 只用 kind / actionName；禁止 member / select / query 旧参数。',
      '执行规则: 先 model_action_guide 查 editDataSet 与 DataSetCrudTool，再 model_script 通过 editDataSet 回调变更表/视图/绑定。',
      '脚本规则: model_script.script 只写 JavaScript async function body；不要写 TS/TSX/JSX、类型注解、import/export、async function(){} / function(){} 包裹。',
      '交付: 仅 commit pagedata.json；nodeTree / rule / script / style 即使 dirty 也不落盘。',
      '模型来源: generated/dts-class-model。',
    ].join('\n')
  }
  return [
    `当前 pageDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    ...sharedHeader,
    '知识索引: DTS ClassModel（ProjectModel → ConfigPageNode）；用 model_query / model_action_guide 读取契约后 model_script 执行。',
    '工具参数: model_query 只用 kind / keyword / includeMembers；model_action_guide 只用 kind / actionName；禁止 member / select / query 旧参数。',
    ...pageDesignScriptSopLines(input),
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function createPageDesignSystemPrompt(input: PageDesignRunInput): string {
  return formatPageDesignSystemPrompt(input)
}

function pageDesignScriptSopLines(input: PageDesignRunInput): readonly string[] {
  return [
    'model_script 标准写法: script 是 JavaScript async function body；不要写 TS/TSX/JSX、类型注解、import/export、async function(){} / function(){} / return (async function...) 包裹。',
    `四文件写入闭环: const page = this.openPageDesign("${input.pageId}"); page.setFileText("pagedata.json", JSON.stringify(data, null, 2)); page.setFileText("rule.json", JSON.stringify(rule, null, 2)); page.setFileText("script.js", scriptText); page.setFileText("style.css", cssText); return { pageId: page.pageId }。`,
    '四文件名只允许 rule.json / pagedata.json / script.js / style.css；不要使用 style.json 或 script.json。',
    '表单页交付底线: pagedata.json 必须建业务表与 default view；rule.json 必须有 r-form、字段 prop 绑定、列表区域、提交按钮；枚举字段必须提供可用 options。',
    '绑定格式: dataViewKey 使用 TableName@default；字段绑定使用 dataMember + dataField/prop，不使用旧点号路径。',
    ...leaveRequestPageDesignHintLines(input),
  ]
}

function leaveRequestPageDesignHintLines(input: PageDesignRunInput): readonly string[] {
  const text = `${input.description}\n${input.effectiveDescription}\n${input.planningTitle ?? ''}`.toLowerCase()
  if (!text.includes('请假') && !text.includes('leave')) return []
  return [
    '本轮请假申请页验收字段: LeaveRequest 表至少包含 applicantName、leaveType、startDate、endDate、reason、status，以及 days/duration/dayCount 之一。',
    '请假类型必须给静态 options，例如 年假、事假、病假、婚假、产假、丧假、其他。',
    'rule.json 至少包含绑定 LeaveRequest@default 的 r-form、这些字段的 r-form-item、提交申请按钮和请假记录 r-table。',
  ]
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
