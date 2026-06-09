/**
 * 项目策划 AI 输入契约与 Host 业务注册。
 *
 * 策划阶段只消费 navigation description + 附件详细说明，产出子模块/页面概要；
 * 不绑定 pageDesign 四文件或 config-page metadata。
 */
import {
  createSimpleInputContract,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
  type EnrichFunctionCallFailureCommand,
  VcmNativeAgentAdapter,
} from '@spark-appworks/spark-ai/agent'
import { VCM_NATIVE_TOOL_NAMES } from '@spark-appworks/spark-ai/vcm-native'
import type { AiModuleMetadataJson } from '@spark-appworks/spark-ai/vcm-native'
import { resolveModuleMetadataJson } from '@spark-appworks/spark-ai/vcm-native'
import { ProjectModel, type ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { evaluateProjectPlanningToolGate } from '@/services/project-planning-gates'
import { projectModelRuntimeMetadataDocument } from '../../generated/vcm/project-model/project-model-module-metadata.runtime'
import { createProjectPlanningVcmKnowledgeProvider } from '@/services/project-planning-vcm-knowledge-provider'

export const PROJECT_PLANNING_MODULE_ID = 'projectPlanning'

export type ProjectPlanningRunInput = Readonly<{
  projectId: string
  /** 项目级短需求；来自 readProjectPlanningInput().requirement。 */
  requirement: string
  /** 项目级策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 项目级附件解析正文；runner 在调用 LLM 前由工作区填充。 */
  planningAttachmentText?: string
  /** 各导航节点策划输入（含模块/页面）。 */
  navigationNodes: readonly NavigationPlanningRunInput[]
}>

/** Host inputContract 用可变数组，满足 AiJsonParams。 */
export type ProjectPlanningAgentInput = Readonly<{
  projectId: string
  requirement: string
  planningAttachmentRef?: string
  planningAttachmentText?: string
  navigationNodes: NavigationPlanningAgentInput[]
}>

export type NavigationPlanningAgentInput = Readonly<{
  nodeId: string
  title: string
  nodeKind: string
  requirement: string
  planningAttachmentRef?: string
  planningAttachmentText?: string
}>

export type NavigationPlanningRunInput = Readonly<{
  nodeId: string
  title: string
  nodeKind: string
  /** 节点短需求，即 navigation description。 */
  requirement: string
  planningAttachmentRef?: string
  /** 节点附件解析正文；runner 在调用 LLM 前由工作区填充。 */
  planningAttachmentText?: string
}>

export type ResolveProjectPlanningRunInputOptions = Readonly<{
  /** 项目级附件正文。 */
  planningAttachmentText?: string
  /** 按 nodeId 提供节点附件正文。 */
  navigationAttachmentTextByNodeId?: Readonly<Record<string, string>>
}>

export type FilterNavigationPlanningNodesOptions = Readonly<{
  /** 仅包含这些 nodeId；未传则按 includeEmptyRequirement 规则过滤。 */
  scopeNodeIds?: readonly string[]
  /** 默认 false：跳过 requirement 与 planningAttachmentRef 均为空的节点。 */
  includeEmptyRequirement?: boolean
}>

export type ResolveScopedProjectPlanningRunInputOptions =
  ResolveProjectPlanningRunInputOptions & FilterNavigationPlanningNodesOptions

export type EnsureProjectPlanningBusinessOptions = Readonly<{
  host: AiAgentHost
  getProjectPlanningEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}>

export function resolveProjectPlanningRunInput(
  project: ProjectModel,
  options: ResolveProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const planning = project.readProjectPlanningInput()
  const requirement = planning.requirement.trim()
  if (requirement.length === 0) {
    throw new Error('projectPlanning: requirement is empty; set navigation root description or project.description.')
  }
  const projectAttachmentText = options.planningAttachmentText?.trim()
  const navigationNodes = project.readNavigationPlanningInputs().map((node) => {
    const nodeAttachmentText = options.navigationAttachmentTextByNodeId?.[node.nodeId]?.trim()
    return {
      nodeId: node.nodeId,
      title: node.title,
      nodeKind: node.nodeKind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
      ...(nodeAttachmentText === undefined || nodeAttachmentText.length === 0
        ? {}
        : { planningAttachmentText: nodeAttachmentText }),
    }
  })

  return {
    projectId: project.projectId,
    requirement,
    ...(planning.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: planning.planningAttachmentRef }),
    ...(projectAttachmentText === undefined || projectAttachmentText.length === 0
      ? {}
      : { planningAttachmentText: projectAttachmentText }),
    navigationNodes,
  }
}

export function resolveNavigationPlanningRunInput(
  project: ProjectModel,
  nodeId: string,
  options: Readonly<{ planningAttachmentText?: string }> = {},
): NavigationPlanningRunInput {
  const node = project.readNavigationNodePlanningInput(nodeId)
  const attachmentText = options.planningAttachmentText?.trim()
  return {
    nodeId: node.nodeId,
    title: node.title,
    nodeKind: node.nodeKind,
    requirement: node.requirement,
    ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    ...(attachmentText === undefined || attachmentText.length === 0 ? {} : { planningAttachmentText: attachmentText }),
  }
}

export function formatProjectPlanningPromptContext(input: ProjectPlanningRunInput): string {
  const lines = [
    '项目策划输入（短需求 + 附件详细说明）：',
    `projectId: ${input.projectId}`,
    'projectRequirement:',
    input.requirement,
  ]
  if (input.planningAttachmentRef !== undefined) {
    lines.push(`projectPlanningAttachmentRef: ${input.planningAttachmentRef}`)
  }
  if (input.planningAttachmentText !== undefined) {
    lines.push('projectPlanningAttachmentText:', input.planningAttachmentText)
  }
  if (input.navigationNodes.length > 0) {
    lines.push('', 'navigationNodes:')
    for (const node of input.navigationNodes) {
      lines.push(`- ${node.nodeId} (${node.nodeKind}) ${node.title}`)
      if (node.requirement.length > 0) lines.push(`  requirement: ${node.requirement}`)
      if (node.planningAttachmentRef !== undefined) {
        lines.push(`  planningAttachmentRef: ${node.planningAttachmentRef}`)
      }
      if (node.planningAttachmentText !== undefined) {
        lines.push(`  planningAttachmentText: ${node.planningAttachmentText}`)
      }
    }
  }
  lines.push(
    '',
    '输出目标：为子模块与页面生成概要设计（title + description），写入 navigation 节点 description；本阶段不涉及四文件或 openPageDesign。',
  )
  return lines.join('\n')
}

export function filterNavigationPlanningRunNodes(
  nodes: readonly NavigationPlanningRunInput[],
  options: FilterNavigationPlanningNodesOptions = {},
): readonly NavigationPlanningRunInput[] {
  const scopeNodeIds = options.scopeNodeIds
  if (scopeNodeIds !== undefined && scopeNodeIds.length > 0) {
    const allowed = new Set(scopeNodeIds)
    return nodes.filter(node => allowed.has(node.nodeId))
  }
  if (options.includeEmptyRequirement === true) {
    return nodes
  }
  return nodes.filter((node) => {
    if (node.requirement.trim().length > 0) return true
    if (node.planningAttachmentRef !== undefined) return true
    if (node.planningAttachmentText !== undefined && node.planningAttachmentText.trim().length > 0) {
      return true
    }
    return false
  })
}

export function resolveScopedProjectPlanningRunInput(
  project: ProjectModel,
  options: ResolveScopedProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const base = resolveProjectPlanningRunInput(project, options)
  return {
    ...base,
    navigationNodes: filterNavigationPlanningRunNodes(base.navigationNodes, options),
  }
}

export function buildProjectPlanningAgentInput(
  project: ProjectModel,
  options: ResolveScopedProjectPlanningRunInputOptions = {},
): ProjectPlanningAgentInput {
  const scoped = resolveScopedProjectPlanningRunInput(project, options)
  return {
    projectId: scoped.projectId,
    requirement: scoped.requirement,
    ...(scoped.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: scoped.planningAttachmentRef }),
    ...(scoped.planningAttachmentText === undefined ? {} : { planningAttachmentText: scoped.planningAttachmentText }),
    navigationNodes: scoped.navigationNodes.map((node) => ({
      nodeId: node.nodeId,
      title: node.title,
      nodeKind: node.nodeKind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
      ...(node.planningAttachmentText === undefined ? {} : { planningAttachmentText: node.planningAttachmentText }),
    })),
  }
}

export function ensureProjectPlanningBusiness(options: EnsureProjectPlanningBusinessOptions): AiAgentHost {
  return options.host.ensure(PROJECT_PLANNING_MODULE_ID, {
    moduleId: PROJECT_PLANNING_MODULE_ID,
    create: () => VcmNativeAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      metadata: readProjectPlanningProjectMetadata(),
      options: {
        moduleId: PROJECT_PLANNING_MODULE_ID,
        knowledge: createProjectPlanningVcmKnowledgeProvider(),
        inputContract: createSimpleInputContract<ProjectPlanningAgentInput>({
          businessId: PROJECT_PLANNING_MODULE_ID,
          identityField: 'projectId',
          messageField: 'requirement',
          paramsSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              requirement: { type: 'string' },
              planningAttachmentRef: { type: 'string' },
              planningAttachmentText: { type: 'string' },
              navigationNodes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nodeId: { type: 'string' },
                    title: { type: 'string' },
                    nodeKind: { type: 'string' },
                    requirement: { type: 'string' },
                    planningAttachmentRef: { type: 'string' },
                    planningAttachmentText: { type: 'string' },
                  },
                  required: ['nodeId', 'title', 'nodeKind', 'requirement'],
                  additionalProperties: false,
                },
              },
            },
            required: ['projectId', 'requirement', 'navigationNodes'],
            additionalProperties: false,
          },
          systemPrompt: createProjectPlanningSystemPrompt,
          title: input => `projectPlanning:${input.projectId}`,
          readonlySteps: [
            '策划输入已注入 requirement 与 navigationNodes；禁止从 pageDesign 四文件或 openPageDesign 反推需求。',
            '先 vcm_query / vcm_action_guide 确认 ProjectModel 策划 action，再用 vcm_script 读写 navigation description。',
            '本阶段禁止 openPageDesign、writePageFile、editNodeTree、editDataSet；完成概要后 agent_complete。',
          ],
        }),
        resolveInstance: ctx => resolveProjectPlanningProject(options, ctx),
        beforeFunctionCall: (instance: ProjectModel, hookOptions) => evaluateProjectPlanningBeforeFunctionCall(
          instance,
          hookOptions,
        ),
        executionToolNames: PROJECT_PLANNING_EXECUTION_TOOL_NAMES,
        planWithoutToolMarkers: PROJECT_PLANNING_PLAN_WITHOUT_TOOL_MARKERS,
        toolLoopNudge: createProjectPlanningToolLoopNudge,
        enrichRecoveryHints: enrichProjectPlanningRecoveryHints,
        ...(projectModelRuntimeMetadataDocument.$defs === undefined
          ? {}
          : { jsonSchemaDefs: projectModelRuntimeMetadataDocument.$defs }),
      },
    }),
  })
}

const PROJECT_PLANNING_EXECUTION_TOOL_NAMES = new Set<string>([
  VCM_NATIVE_TOOL_NAMES.script,
])

const PROJECT_PLANNING_PLAN_WITHOUT_TOOL_MARKERS = [
  'readplanningprojection',
  'readnavigationplanninginputs',
  'applynavigationnodeedit',
  'readprojectplanninginput',
] as const

function createProjectPlanningToolLoopNudge(context: AiAgentToolLoopNudgeContext): string | undefined {
  const projectId = context.moduleInstanceId.trim()
  if (projectId.length === 0) return undefined
  switch (context.reason) {
    case 'plan_without_tool':
      return [
        '策划阶段禁止只输出计划；下一回合必须发起真实 tool_call（vcm_script 或 vcm_action_guide）。',
        `projectId="${projectId}"；只读写 navigation description，禁止 openPageDesign。`,
      ].join('\n')
    case 'execution_phase':
      return [
        `目录/指南阶段已完成，projectId="${projectId}"；直接 vcm_script 更新 navigation 策划文案。`,
        '禁止 openPageDesign、editNodeTree、editDataSet；完成后 agent_complete({ summary })。',
      ].join('\n')
    case 'module_script_retry':
      return [
        '上一次 vcm_script 失败：按 RECOVERY_HINT 修正 navigation action 参数。',
        '禁止 openPageDesign；只用 readProjectPlanningInput / applyNavigationNodeEdit 等策划 action。',
      ].join('\n')
    default:
      return undefined
  }
}

function enrichProjectPlanningRecoveryHints(command: EnrichFunctionCallFailureCommand): readonly string[] {
  const { callResult } = command
  const hints: string[] = []
  const msg = callResult.msg.toLowerCase()
  if (msg.includes('openpagedesign') || msg.includes('editnodetree') || msg.includes('editdataset')) {
    hints.push('projectPlanning 阶段禁止 openPageDesign / editNodeTree / editDataSet；改用 navigation 策划 action。')
  }
  if (callResult.code === 'FUNCTION_NOT_FOUND') {
    hints.push('策划 action 见 vcm_query({ kind: "project", includeMembers: true })；勿猜 pageDesign action 名。')
  }
  return hints
}

function createProjectPlanningSystemPrompt(input: ProjectPlanningAgentInput): string {
  const context = formatProjectPlanningPromptContext({
    ...input,
    navigationNodes: input.navigationNodes,
  })
  return [
    `当前 projectPlanning 项目: ${input.projectId}`,
    context,
    '执行主通道: vcm_script({ script })；this 绑定当前 ProjectModel，只操作 navigation 策划面。',
    '禁止: openPageDesign、四文件读写、SparkNode/DataSet 结构改写。',
    '允许: readProjectPlanningInput、readNavigationPlanningInputs、readPlanningProjection、applyNavigationNodeEdit 等 navigation 策划 action。',
    '元数据来源: generated projectPlanning module metadata（仅 ProjectModel，不含 config-page）。',
    '完成后必须 agent_complete({ summary })。',
  ].join('\n')
}

function resolveProjectPlanningProject(
  options: EnsureProjectPlanningBusinessOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId.trim()
  if (moduleInstanceId.length === 0) {
    throw new Error('projectPlanning ProjectModel requires host.moduleInstanceId.')
  }
  return options.getProjectPlanningEditor({ moduleInstanceId }).project
}

function evaluateProjectPlanningBeforeFunctionCall(
  _project: ProjectModel,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const gate = evaluateProjectPlanningToolGate(options)
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'projectPlanning gate rejected tool call.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}

function readProjectPlanningProjectModule() {
  return projectModelRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
}

function readProjectPlanningProjectMetadata(): AiModuleMetadataJson {
  const projectModule = readProjectPlanningProjectModule()
  if (projectModule === undefined) {
    throw new Error('projectPlanning runtime metadata missing ProjectModel rootApi.')
  }
  return resolveModuleMetadataJson(projectModule, {
    inlineSchemaRefs: false,
    ...(projectModelRuntimeMetadataDocument.$defs === undefined
      ? {}
      : { schemaDefs: projectModelRuntimeMetadataDocument.$defs }),
  })
}
