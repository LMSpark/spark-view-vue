/**
 * @module app:services/page-data-design-business
 * 职责：pageDataDesign AI 业务注册，聚焦 pagedata.json / DataSet 建模，不涉及 nodeTree / rule / script / style。
 * 边界：只组装 AiAgentRegistration 与 inputContract，不执行 Host Run 落盘。
 * AI用途：排查第三业务能力 alias、工单 schema 或 script 门禁时，用本模块确认 ensure 模板。
 */
import {
  createSimpleInputContract,
  ClassModelAgentAdapter,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
} from '@/services/spark-ai-agent-bindings'
import { CLASS_MODEL_TOOL_NAMES } from '@spark-appworks/spark-ai/class-model'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { dtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'
import { createPageDataDesignClassModelKnowledgeProvider } from '@/services/page-data-design/page-data-design-class-model-knowledge-provider'
import { evaluatePageDataDesignToolGate } from '@/services/page-data-design-gates'
import {
  resolvePageDesignPlanningContext,
  type PageDesignRunMode,
} from '@/services/page-design-business'

export const PAGE_DATA_DESIGN_MODULE_ID = 'pageDataDesign'

const PAGE_DATA_DESIGN_ROOT_CLASS_NAME = 'ProjectModel'

/** Page Data Design Run Input 的输入数据。 */
export type PageDataDesignRunInput = Readonly<{
  pageId: string
  description: string
  effectiveDescription: string
  projectId?: string
  planningTitle?: string
  planningPath?: string
  mode?: PageDesignRunMode
  /** 可选的数据建模补充说明（表结构、CRUD、绑定约束）。 */
  dataRequirement?: string
}>

/** Ensure Page Data Design Business Options 的调用配置。 */
export type EnsurePageDataDesignBusinessOptions = Readonly<{
  host: AiAgentHost
  getPageDataDesignEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}>

export function ensurePageDataDesignBusiness(
  options: EnsurePageDataDesignBusinessOptions,
): AiAgentHost {
  return options.host.ensure(PAGE_DATA_DESIGN_MODULE_ID, {
    moduleId: PAGE_DATA_DESIGN_MODULE_ID,
    create: () => ClassModelAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      options: {
        moduleId: PAGE_DATA_DESIGN_MODULE_ID,
        rootClassName: PAGE_DATA_DESIGN_ROOT_CLASS_NAME,
        dtsClassModelManifestUrl,
        knowledge: createPageDataDesignClassModelKnowledgeProvider(),
        inputContract: createSimpleInputContract<PageDataDesignRunInput>({
          businessId: PAGE_DATA_DESIGN_MODULE_ID,
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
              dataRequirement: { type: 'string' },
            },
            required: ['pageId', 'description', 'effectiveDescription'],
            additionalProperties: false,
          },
          systemPrompt: createPageDataDesignSystemPrompt,
          title: input => `pageDataDesign:${input.pageId}`,
          readonlySteps: [
            '策划约束已注入 effectiveDescription。',
            '本能力只改 pagedata.json（editDataSet），不涉及 nodeTree / rule / script / style。',
            '业务契约见 ClassModel 知识索引（model_query / model_action_guide）。',
          ],
        }),
        resolveInstance: ctx => resolvePageDataDesignProject(options, ctx),
        beforeFunctionCall: (instance, hookOptions) => evaluatePageDataDesignBeforeFunctionCall(
          instance,
          hookOptions,
        ),
        executionToolNames: PAGE_DATA_DESIGN_EXECUTION_TOOL_NAMES,
        planWithoutToolMarkers: PAGE_DATA_DESIGN_PLAN_WITHOUT_TOOL_MARKERS,
        toolLoopNudge: createPageDataDesignToolLoopNudge,
      },
    }),
  })
}

const PAGE_DATA_DESIGN_EXECUTION_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.script,
])

const PAGE_DATA_DESIGN_PLAN_WITHOUT_TOOL_MARKERS = [
  'editdataset',
  'openpagedesign',
] as const

export function buildPageDataDesignRunInput(options: Readonly<{
  pageId: string
  projectId: string
  description: string
  project: ProjectModel
  dataRequirement?: string
  mode?: PageDesignRunMode
}>): PageDataDesignRunInput {
  const planning = resolvePageDesignPlanningContext(options.project, options.pageId)
  return {
    pageId: options.pageId,
    description: options.description,
    effectiveDescription: planning.effectiveDescription,
    projectId: options.projectId,
    ...(planning.planningTitle === undefined ? {} : { planningTitle: planning.planningTitle }),
    ...(planning.planningPath === undefined ? {} : { planningPath: planning.planningPath }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.dataRequirement === undefined ? {} : { dataRequirement: options.dataRequirement }),
  }
}

function createPageDataDesignToolLoopNudge(context: AiAgentToolLoopNudgeContext): string | undefined {
  const pageId = context.moduleInstanceId.trim()
  if (pageId.length === 0) return undefined
  switch (context.reason) {
    case 'plan_without_tool':
      return `pageId="${pageId}"；pageDataDesign 禁止只输出计划，下一回合必须 model_script 调用 editDataSet。`
    case 'execution_phase':
      return `pageId="${pageId}"；只改 pagedata.json：await this.openPageDesign({ pageId: "${pageId}" }).editDataSet(tool => …)；禁止 editNodeTree / setFileText。`
    case 'model_script_retry':
      return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script，仍只通过 editDataSet 变更 DataSet。`
    default:
      return undefined
  }
}

function createPageDataDesignSystemPrompt(input: PageDataDesignRunInput): string {
  const effectiveDescription = input.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    throw new Error('pageDataDesign systemPrompt requires effectiveDescription from readPlanningProjection.')
  }
  const planningTitle = input.planningTitle?.trim() ?? input.pageId
  const planningPath = input.planningPath?.trim() ?? `/${input.pageId}`
  const projectId = input.projectId?.trim() ?? 'homepage'
  const lines = [
    `当前 pageDataDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    `projectId=${projectId}；pageId=${input.pageId}。`,
    '策划约束（readPlanningProjection.effectiveDescription）:',
    effectiveDescription,
    `用户本轮目标: ${input.description}`,
    '能力边界: 只修改 pagedata.json（DataSet）；禁止 editNodeTree、rule.json、script.js、style.css。',
    '知识索引: DTS ClassModel（ProjectModel → openPageDesign → editDataSet / DataSetCrudTool）。',
    '执行规则: 先 model_action_guide 查 editDataSet 与 DataSetCrudTool，再 model_script 通过 editDataSet 回调变更表/视图/绑定。',
    '模型来源: generated/dts-class-model。',
  ]
  const dataRequirement = input.dataRequirement?.trim()
  if (dataRequirement !== undefined && dataRequirement.length > 0) {
    lines.splice(lines.length - 1, 0, '数据建模补充说明:', dataRequirement)
  }
  return lines.join('\n')
}

function resolvePageDataDesignProject(
  options: EnsurePageDataDesignBusinessOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId
  if (moduleInstanceId.trim().length === 0) {
    throw new Error('pageDataDesign ProjectModel requires host.moduleInstanceId.')
  }
  const editor = options.getPageDataDesignEditor({ moduleInstanceId })
  editor.project.openPageDesign(moduleInstanceId)
  return editor.project
}

function evaluatePageDataDesignBeforeFunctionCall(
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
      reason: `pageDataDesign: no planning projection for pageId "${pageId}".`,
      fix: '先 readPlanningProjection，确认 pageId 存在于 pageFeatures。',
    }
  }
  const gate = evaluatePageDataDesignToolGate({
    toolName: options.toolName,
    args: options.args,
    summary,
  })
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'pageDataDesign gate rejected tool call.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}
