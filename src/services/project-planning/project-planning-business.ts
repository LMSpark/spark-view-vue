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
  WorkerClassModelKnowledgeProvider,
  CLASS_MODEL_TOOL_NAMES,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import {
  ProjectRootModel,
  applyProjectRootModelToProjectModel,
  projectRootModelFromProjectModel,
  type ProjectModel,
  type ProjectNodeData,
  type ProjectWorkspace,
} from '@spark-appworks/spark-project-model'
import { dtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

export const PROJECT_PLANNING_MODULE_ID = 'projectPlanning'

const PROJECT_PLANNING_ROOT_CLASS_NAME = 'ProjectRootModel'

function createProjectPlanningClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  if (typeof Worker === 'undefined') {
    throw new Error('DTS ClassModel knowledge requires Web Worker on-demand loading.')
  }

  const worker = new Worker(
    new URL('../class-model-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerClassModelKnowledgeProvider(worker, {
    dtsClassModelManifestUrl,
    rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
  })
}

const projectPlanningDomainRoots = new Map<string, ProjectRootModel>()

/** Project Planning Run Input 的输入数据。 */
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
  projectScopeKey: string
  projectId: string
  requirement: string
  planningAttachmentRef?: string
  planningAttachmentText?: string
  navigationNodes: NavigationPlanningAgentInput[]
}>

/** Navigation Planning Agent Input 的输入数据。 */
export type NavigationPlanningAgentInput = Readonly<{
  nodeId: string
  title: string
  nodeKind: string
  requirement: string
  planningAttachmentRef?: string
  planningAttachmentText?: string
}>

/** Navigation Planning Run Input 的输入数据。 */
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
  host: AiAgentHost
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
      moduleClass: ProjectRootModel,
      options: {
        moduleId: PROJECT_PLANNING_MODULE_ID,
        rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
        dtsClassModelManifestUrl,
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
        beforeFunctionCall: (instance: ProjectRootModel, hookOptions) => evaluateProjectPlanningBeforeFunctionCall(
          instance,
          hookOptions,
        ),
        afterFunctionCall: (instance: ProjectRootModel, hookOptions) => {
          if (hookOptions.toolName === CLASS_MODEL_TOOL_NAMES.script) {
            const editor = options.getProjectPlanningEditor({ moduleInstanceId: hookOptions.moduleInstanceId })
            applyProjectRootModelToProjectModel(instance, editor.project)
          }
          return { status: 'continue' }
        },
        releaseModuleInstance: (_instance, moduleInstanceId) => {
          projectPlanningDomainRoots.delete(moduleInstanceId)
        },
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
      return `projectId="${projectId}"；目录/指南阶段已完成，直接 model_script：根对象是 this，先 await this.readProjectPlanningInput() / await this.readNavigationPlanningInputs()，完成后 await this.replaceNavigationChildren({ children })；children 必须包含 module 及其 page 子节点，不能只有 module 壳；不要写 project.replaceNavigationChildren 或 project.projectPlanning。`
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
    '知识索引: DTS ClassModel（ProjectRootModel 根模型）；只把 ClassModel 当作模型知识索引，项目策划语义只在 App 层本业务内编排。',
    '职责边界: LLM 只负责发出 model_script({ script }) tool_call；script 是 async function body；运行时负责把 this 绑定到 ProjectRootModel 并执行脚本。',
    '执行规则: 不要把脚本写成普通文本回答；不要直接声明或访问 project 对象；不要用 project.xxx 路径；最终必须通过 model_script 的 script 字符串调用 this.xxx。',
    '知识查询规则: action 只用 model_action_guide({ kind: "ProjectRootModel", actionName }) 查询；attribute 才用 model_attribute_guide；replaceNavigationChildren/readProjectPlanningInput/readNavigationPlanningInputs 都是 action。',
    '参数契约规则: 不要查询 ProjectNodeData 当作 attribute；children 的结构来自 model_action_guide({ kind: "ProjectRootModel", actionName: "replaceNavigationChildren" }) 的 paramsSchema.children。',
    '执行前查询: model_action_guide({ kind: "ProjectRootModel", actionName: "readProjectPlanningInput" }) + model_action_guide({ kind: "ProjectRootModel", actionName: "readNavigationPlanningInputs" }) + model_action_guide({ kind: "ProjectRootModel", actionName: "replaceNavigationChildren" })，然后 model_script 读取输入并写入 navigation children 概要。',
    '导航结构规则: 顶层按业务域生成 module；每个主要 module 至少包含 1 个 nodeKind="page" 的 children 页面概要；禁止只生成一组 module 壳。',
    '完成自检: agent_complete 前必须确认 navigationRoot.children 的业务 module 下存在 nodeKind="page"；如果没有 page，必须先重发 model_script 修正 children。',
    ...projectPlanningScriptSopLines(input.projectId),
    '输出要求: children 节点使用稳定英文 id/path，title/description 承载本轮产品需求的模块与页面概要；不调用 openPageDesign/writePageFile/readPageFileText。',
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function projectPlanningScriptSopLines(projectId: string): readonly string[] {
  return [
    'model_script 标准写法：以下内容必须作为 tool_call 参数 script 的函数体交给运行时执行；不要作为自然语言回答。',
    '根对象就是 this；不要访问 project.replaceNavigationChildren，不存在 project.projectPlanning。',
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
): ProjectRootModel {
  const moduleInstanceId = ctx.moduleInstanceId.trim()
  if (moduleInstanceId.length === 0) {
    throw new Error('projectPlanning ProjectRootModel requires host.moduleInstanceId.')
  }
  const cached = projectPlanningDomainRoots.get(moduleInstanceId)
  if (cached !== undefined) return cached
  const editor = options.getProjectPlanningEditor({ moduleInstanceId })
  const domain = projectRootModelFromProjectModel(editor.project)
  projectPlanningDomainRoots.set(moduleInstanceId, domain)
  return domain
}

function evaluateProjectPlanningBeforeFunctionCall(
  project: ProjectRootModel,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const completionGate = evaluateProjectPlanningCompletionGate(project, options)
  if (completionGate !== undefined) return completionGate

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

function evaluateProjectPlanningCompletionGate(
  project: ProjectRootModel,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective | undefined {
  if (options.toolName !== CLASS_MODEL_TOOL_NAMES.agentComplete) return undefined
  if (!project.navigationDirty) {
    return {
      status: 'reject',
      reason: 'projectPlanning: navigation children 尚未通过 model_script 写入，不能 agent_complete。',
      fix: '先发起真实 model_script({ script }) tool_call，在 script 中 await this.readProjectPlanningInput() / await this.readNavigationPlanningInputs()，然后 await this.replaceNavigationChildren({ children })；完成写入后再 agent_complete。',
    }
  }
  return evaluateProjectPlanningNavigationShapeForCompletion(project)
}

function evaluateProjectPlanningNavigationShapeForCompletion(
  project: ProjectRootModel,
): AiAgentBeforeFunctionCallDirective | undefined {
  const pageCount = countNavigationNodesByKind(project.toTree(), 'page')
  if (pageCount > 0) return undefined
  return {
    status: 'reject',
    reason: 'projectPlanning: navigation 策划只有模块壳，缺少 nodeKind="page" 的页面概要，不能 agent_complete。',
    fix: '重发 model_script({ script })，用 replaceNavigationChildren 写入 module + page 两级导航；每个主要业务 module 至少放入一个 page 子节点，page 只写 title/path/description 概要，不进入 pageDesign 四文件。',
  }
}

function countNavigationNodesByKind(nodes: readonly ProjectNodeData[], nodeKind: string): number {
  let count = 0
  for (const node of nodes) {
    if (node.nodeKind === nodeKind) count += 1
    if (Array.isArray(node.children)) count += countNavigationNodesByKind(node.children, nodeKind)
  }
  return count
}

/** Project Planning Gate Validation Result 的返回结果。 */
export type ProjectPlanningGateValidationResult = Readonly<{
  ok: boolean
  reason?: string
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
    fix: '改用 readProjectPlanningInput / readNavigationPlanningInputs / replaceNavigationChildren 等通用 ProjectRootModel action；完成概要后 agent_complete。',
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
    reason: `projectPlanning: ${attributeName} 是 ProjectRootModel action，不是 attribute。`,
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
