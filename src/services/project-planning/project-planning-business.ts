/**
 * @module app:services/project-planning-business
 * 职责：提供应用运行时 service 层的 project planning business 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * 项目策划 AI 输入契约与 Host 业务注册。
 *
 * 策划阶段只消费 navigation description + 附件详细说明，产出子模块/页面概要；
 * 不绑定 pageDesign 四文件或 config-page metadata。
 */
import {
  createSimpleInputContract,
  ClassModelAgentAdapter,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
} from '@/services/ai/spark-ai-agent-bindings'
import {
  CLASS_MODEL_TOOL_NAMES,
  createWorkerDtsClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import {
  ProjectModel,
  type ProjectWorkspace,
} from '@spark-appworks/spark-project-model'
import { getDtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

export const PROJECT_PLANNING_MODULE_ID = 'projectPlanning'

const PROJECT_PLANNING_ROOT_CLASS_NAME = 'ProjectModel'

function createProjectPlanningClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
  })
}

/** Project Planning Run Input 的输入数据。 */
export type ProjectPlanningRunInput = Readonly<{
  /** 项目唯一标识。 */
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
  /** Agent 输入的身份键（通常等于 projectId）。 */
  projectScopeKey: string
  /** 项目唯一标识。 */
  projectId: string
  /** 项目级策划短需求文本。 */
  requirement: string
  /** 项目级策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 项目级附件解析正文。 */
  planningAttachmentText?: string
  /** 各导航节点的策划输入列表。 */
  navigationNodes: NavigationPlanningAgentInput[]
}>

/** Navigation Planning Agent Input 的输入数据。 */
export type NavigationPlanningAgentInput = Readonly<{
  /** 导航节点 id。 */
  nodeId: string
  /** 节点显示标题。 */
  title: string
  /** 节点类型（module/page 等）。 */
  nodeKind: string
  /** 节点短需求（navigation description）。 */
  requirement: string
  /** 节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 节点附件解析正文。 */
  planningAttachmentText?: string
}>

/** Navigation Planning Run Input 的输入数据。 */
export type NavigationPlanningRunInput = Readonly<{
  /** 导航节点 id。 */
  nodeId: string
  /** 节点显示标题。 */
  title: string
  /** 节点类型（module/page 等）。 */
  nodeKind: string
  /** 节点短需求，即 navigation description。 */
  requirement: string
  /** 节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 节点附件解析正文；runner 在调用 LLM 前由工作区填充。 */
  planningAttachmentText?: string
}>

/** Resolve Project Planning Run Input Options 的调用配置。 */
export type ResolveProjectPlanningRunInputOptions = Readonly<{
  /** Host Run 可注入一次性需求，不写回 ProjectModel。 */
  requirementOverride?: string
  /** 项目级附件正文。 */
  planningAttachmentText?: string
  /** 按 nodeId 提供节点附件正文。 */
  navigationAttachmentTextByNodeId?: Readonly<Record<string, string>>
}>

/** Filter Navigation Planning Nodes Options 的调用配置。 */
export type FilterNavigationPlanningNodesOptions = Readonly<{
  /** 仅包含这些 nodeId；未传则按 includeEmptyRequirement 规则过滤。 */
  scopeNodeIds?: readonly string[]
  /** 默认 false：跳过 requirement 与 planningAttachmentRef 均为空的节点。 */
  includeEmptyRequirement?: boolean
}>

/** Resolve Scoped Project Planning Run Input Options 的调用配置。 */
export type ResolveScopedProjectPlanningRunInputOptions =
  ResolveProjectPlanningRunInputOptions & FilterNavigationPlanningNodesOptions

/** Ensure Project Planning Business Options 的调用配置。 */
export type EnsureProjectPlanningBusinessOptions = Readonly<{
  /** AI Agent Host 实例。 */
  host: AiAgentHost
  /** 按 moduleInstanceId 获取 ProjectWorkspace 编辑器。 */
  getProjectPlanningEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}>

export function resolveProjectPlanningRunInput(
  project: ProjectModel,
  options: ResolveProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const planning = project.readProjectPlanningInput()
  const overrideRequirement = options.requirementOverride?.trim()
  const requirement = overrideRequirement !== undefined && overrideRequirement.length > 0
    ? overrideRequirement
    : planning.requirement.trim()
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
    '策划阶段不涉及四文件，只产出导航/页面概要。',
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
  lines.push('', '输出目标见 DTS ClassModel 知识索引与本轮 requirement。')
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
    projectScopeKey: scoped.projectId,
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
    create: () => ClassModelAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      options: {
        moduleId: PROJECT_PLANNING_MODULE_ID,
        rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
        dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
        knowledge: createProjectPlanningClassModelKnowledgeProvider(),
        inputContract: createSimpleInputContract<ProjectPlanningAgentInput>({
          businessId: PROJECT_PLANNING_MODULE_ID,
          identityField: 'projectScopeKey',
          messageField: 'requirement',
          paramsSchema: {
            type: 'object',
            properties: {
              projectScopeKey: { type: 'string' },
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
            required: ['projectScopeKey', 'projectId', 'requirement', 'navigationNodes'],
            additionalProperties: false,
          },
          systemPrompt: createProjectPlanningSystemPrompt,
          title: input => `projectPlanning:${input.projectId}`,
          readonlySteps: [
            '策划输入已注入 requirement 与 navigationNodes。',
            '业务契约见 DTS ClassModel 知识索引（model_query / model_action_guide）。',
          ],
        }),
        resolveInstance: (ctx) => resolveProjectPlanningDomainRoot(options, ctx),
        beforeFunctionCall: (_instance: ProjectModel, hookOptions) => evaluateProjectPlanningBeforeFunctionCall(hookOptions),
        agentCompleteMethodName: 'completeProjectPlanning',
        executionToolNames: PROJECT_PLANNING_EXECUTION_TOOL_NAMES,
        planWithoutToolMarkers: PROJECT_PLANNING_PLAN_WITHOUT_TOOL_MARKERS,
        toolLoopNudge: createProjectPlanningToolLoopNudge,
      },
    }),
  })
}

const PROJECT_PLANNING_EXECUTION_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.script,
])

const PROJECT_PLANNING_PLAN_WITHOUT_TOOL_MARKERS = [
  'readplanningprojection',
  'readnavigationplanninginputs',
  'replacenavigationchildren',
  'readprojectplanninginput',
] as const

function createProjectPlanningToolLoopNudge(context: AiAgentToolLoopNudgeContext): string | undefined {
  const projectId = context.moduleInstanceId.trim()
  if (projectId.length === 0) return undefined
  switch (context.reason) {
    case 'plan_without_tool':
      return `projectId="${projectId}"；禁止只输出计划，下一回合必须发起 tool_call（见 model_action_guide / RECOVERY_HINT）。`
    case 'execution_phase':
      return `projectId="${projectId}"；目录/指南阶段已完成，直接 model_script：根对象是 this（ProjectModel），先 await this.readProjectPlanningInput() / await this.readNavigationPlanningInputs()，完成后 await this.replaceNavigationChildren({ children })；children 必须包含 module 及其 page 子节点，不能只有 module 壳。`
    case 'model_script_retry':
      return `projectId="${projectId}"；按 RECOVERY_HINT 修正后重试 model_script；导航策划必须包含至少一个 nodeKind="page" 的页面概要。`
    default:
      return undefined
  }
}

function createProjectPlanningSystemPrompt(input: ProjectPlanningAgentInput): string {
  const context = formatProjectPlanningPromptContext({
    ...input,
    navigationNodes: input.navigationNodes,
  })
  return [
    `当前 projectPlanning 项目: ${input.projectId}`,
    context,
    '知识索引: DTS ClassModel（ProjectModel 根模型）；只把 ClassModel 当作模型知识索引，项目策划语义只在 App 层本业务内编排。',
    '职责边界: LLM 只负责发出 model_script({ script }) tool_call；script 必须是 JavaScript async function body；禁止 TS/TSX/JSX、类型注解、import/export、函数包裹；运行时负责把 this 绑定到 ProjectModel 并执行脚本。',
    '执行规则: 不要把脚本写成普通文本回答；最终必须通过 model_script 的 script 字符串调用 this.xxx。',
    '知识查询规则: action 只用 model_action_guide({ kind: "ProjectModel", actionName }) 查询；attribute 才用 model_attribute_guide；replaceNavigationChildren/readProjectPlanningInput/readNavigationPlanningInputs 都是 action。',
    '参数契约规则: 不要查询 ProjectNodeData 当作 attribute；children 的结构来自 model_action_guide({ kind: "ProjectModel", actionName: "replaceNavigationChildren" }) 的 paramsSchema.children。',
    '执行前查询: model_action_guide({ kind: "ProjectModel", actionName: "readProjectPlanningInput" }) + model_action_guide({ kind: "ProjectModel", actionName: "readNavigationPlanningInputs" }) + model_action_guide({ kind: "ProjectModel", actionName: "replaceNavigationChildren" })，然后 model_script 读取输入并写入 navigation children 概要。',
    '导航结构规则: 顶层按业务域生成 module；每个主要 module 至少包含 1 个 nodeKind="page" 的 children 页面概要；禁止只生成一组 module 壳。',
    '完成自检: agent_complete 会调用 ProjectModel.completeProjectPlanning({ summary })；如果返回失败，按 tool result 的 missingFacts/requiredCapabilities/知识恢复提示补查或补执行后再次 agent_complete。',
    '不要在 model_script 中直接调用 completeProjectPlanning；完成只通过 agent_complete FC 触发。',
    ...projectPlanningScriptSopLines(input.projectId),
    '输出要求: children 节点使用稳定英文 id/path，title/description 承载本轮产品需求的模块与页面概要；不调用 openPageDesign/writePageFile/readPageFileText。',
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function projectPlanningScriptSopLines(projectId: string): readonly string[] {
  return [
    'model_script 标准写法：以下内容必须作为 tool_call 参数 script 的 JavaScript 函数体交给运行时执行；不要作为自然语言回答。',
    '根对象就是 this（ProjectModel）；通过 this.replaceNavigationChildren({ children }) 写入导航策划。',
    '业务功能不要只写 module；module 必须带 children page，页面概要必须使用 nodeKind: "page"。',
    'const projectInput = await this.readProjectPlanningInput()',
    'const existingNodes = await this.readNavigationPlanningInputs()',
    'const children = [',
    '  {',
    '    id: "core-module",',
    '    title: "核心模块",',
    '    nodeKind: "module",',
    '    path: "/core",',
    '    description: projectInput.requirement,',
    '    children: [',
    '      { id: "core-overview", title: "核心总览", nodeKind: "page", path: "/core/overview", description: "核心模块总览与关键任务入口" }',
    '    ]',
    '  }',
    ']',
    'const navigationRoot = await this.replaceNavigationChildren({ children })',
    'if (!JSON.stringify(navigationRoot.children).includes(\'"nodeKind":"page"\')) throw new Error("projectPlanning requires page nodes")',
    `return { kind: "projectPlanningResult", projectId: "${projectId}", navigationRoot, previousNodeCount: existingNodes.length }`,
  ]
}

function resolveProjectPlanningDomainRoot(
  options: EnsureProjectPlanningBusinessOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId.trim()
  if (moduleInstanceId.length === 0) {
    throw new Error('projectPlanning ProjectModel requires host.moduleInstanceId.')
  }
  const editor = options.getProjectPlanningEditor({ moduleInstanceId })
  if (editor.project.projectId !== moduleInstanceId) {
    throw new Error(
      `projectPlanning editor mismatch: expected "${moduleInstanceId}", got "${editor.project.projectId}".`,
    )
  }
  return editor.project
}

function evaluateProjectPlanningBeforeFunctionCall(
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

/** Project Planning Gate Validation Result 的返回结果。 */
export type ProjectPlanningGateValidationResult = Readonly<{
  /** 是否通过 tool gate 校验。 */
  ok: boolean
  /** 拒绝原因（ok 为 false 时）。 */
  reason?: string
  /** 给 LLM 的修正建议（ok 为 false 时）。 */
  fix?: string
}>

const FORBIDDEN_SCRIPT_MARKERS = [
  'openPageDesign',
  'writePageFile',
  'setFileText',
  'getFileText',
  'editNodeTree',
  'editDataSet',
  'getNodeTree',
  'getDataSetTool',
] as const

const PROJECT_ACTION_NAMES = [
  'readProjectPlanningInput',
  'readNavigationPlanningInputs',
  'replaceNavigationChildren',
] as const

const PROJECT_PARAM_TYPE_NAMES = [
  'ProjectNodeData',
] as const

export function evaluateProjectPlanningToolGate(
  options: Pick<AiAgentBeforeFunctionCallOptions, 'toolName' | 'args'>,
): ProjectPlanningGateValidationResult {
  const toolName = normalizeProjectPlanningToolName(options.toolName)
  const actionLookupGate = evaluateProjectActionLookupGate(toolName, options.args)
  if (!actionLookupGate.ok) return actionLookupGate
  if (toolName !== 'model_script') {
    return { ok: true }
  }
  const script = readProjectPlanningModelScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenProjectPlanningScriptMarker(script)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: model_script 禁止调用 ${marker}；本阶段只处理 navigation 策划，不涉及四文件或 openPageDesign。`,
    fix: '改用 readProjectPlanningInput / readNavigationPlanningInputs / replaceNavigationChildren 等 ProjectModel action；完成概要后 agent_complete。',
  }
}

function evaluateProjectActionLookupGate(
  toolName: string,
  args: AiAgentBeforeFunctionCallOptions['args'],
): ProjectPlanningGateValidationResult {
  if (toolName !== 'model_attribute_guide') return { ok: true }
  const kind = readProjectPlanningTextArg(args, 'kind')
  if (kind !== 'project') return { ok: true }
  const attributeName = readProjectPlanningTextArg(args, 'attributeName')
  if (attributeName === undefined || !isProjectActionName(attributeName)) {
    if (attributeName !== undefined && isProjectParamTypeName(attributeName)) {
      return {
        ok: false,
        reason: `projectPlanning: ${attributeName} 是参数结构名，不是 project attribute。`,
        fix: '改用 model_action_guide({ kind: "project", actionName: "replaceNavigationChildren" }) 查看 paramsSchema.children，然后在 model_script 中构造 children 数组。',
      }
    }
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: ${attributeName} 是 ProjectModel action，不是 attribute。`,
    fix: `改用 model_action_guide({ kind: "project", actionName: "${attributeName}" })，然后在 model_script 中通过 this.${attributeName}(...) 调用。`,
  }
}

function readProjectPlanningModelScriptBody(args: AiAgentBeforeFunctionCallOptions['args']): string | undefined {
  const script = args['script']
  if (typeof script !== 'string') return undefined
  const trimmed = script.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function findForbiddenProjectPlanningScriptMarker(script: string): string | undefined {
  for (const marker of FORBIDDEN_SCRIPT_MARKERS) {
    if (script.includes(marker)) return marker
  }
  return undefined
}

function readProjectPlanningTextArg(args: AiAgentBeforeFunctionCallOptions['args'], key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isProjectActionName(value: string): value is typeof PROJECT_ACTION_NAMES[number] {
  return PROJECT_ACTION_NAMES.some(actionName => actionName === value)
}

function isProjectParamTypeName(value: string): value is typeof PROJECT_PARAM_TYPE_NAMES[number] {
  return PROJECT_PARAM_TYPE_NAMES.some(typeName => typeName === value)
}

function normalizeProjectPlanningToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}
