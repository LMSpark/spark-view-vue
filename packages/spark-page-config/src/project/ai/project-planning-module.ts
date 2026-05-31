/**
 * ProjectPlanning AI 业务注册。
 *
 * 本业务位于 PageDesign 之前：它把用户需求沉淀为项目模块、页面和子页面节点。
 * 它不生成页面配置，不暴露 rule/pagedata/script/style 写入口。
 */

import {
  createAiAgentRegistration,
  createAiAgentScope,
  DefaultAiAgentSessionStore,
} from '@spark-view/spark-ai/agent'
import type * as SparkAiAgent from '@spark-view/spark-ai/agent'
import type {
  AiJsonParamShape,
  AiJsonParams,
  AiJsonValue,
} from '@spark-view/spark-ai/json'
import * as SparkAiJson from '@spark-view/spark-ai/json'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleFunctionMetadata,
  type AiModuleInstanceRef,
  type AiModulePathContext,
} from '@spark-view/spark-ai/modules'
import { isRecord } from '@spark-view/spark-utils'

import type {
  ProjectPlanningApplyCommand,
  ProjectPlanningApplyMode,
  ProjectPlanningApplyResult,
  ProjectPlanningEditHost,
  ProjectPlanningNodePlan,
} from '../planning/project-planning-edit-host'
import type { ProjectPlanningSnapshot } from '../planning/project-planning-model'

export const PROJECT_PLANNING_MODULE_ID = 'projectPlanning'
export const PROJECT_PLANNING_AI_AGENT_HOST_ALIAS = PROJECT_PLANNING_MODULE_ID

export type ProjectPlanningRunMode = 'create' | 'extend' | 'revise'

export type ProjectPlanningRunInput = AiJsonParamShape<{
  projectId: string
  userRequirement: string
  mode?: ProjectPlanningRunMode
}>

export type ProjectPlanningRuntimeContext = {
  readonly instanceId: string
  readonly moduleId: typeof PROJECT_PLANNING_MODULE_ID
  readonly moduleInstanceId: string
}

export type ProjectPlanningModuleOptions = {
  readonly getPlanningEditHost: (context: ProjectPlanningRuntimeContext) => ProjectPlanningEditHost
}

type ProjectPlanningServiceContext = {
  readonly requestId: string
  readonly projectId: string
}

type ProjectPlanningServiceResult<TResult> =
  | { readonly ok: true; readonly data: TResult; readonly summary: string }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix: string }

const PROJECT_PLANNING_RUN_MODES: readonly ProjectPlanningRunMode[] = ['create', 'extend', 'revise']
const PROJECT_PLANNING_APPLY_MODES: readonly ProjectPlanningApplyMode[] = ['merge', 'replace']
const PROJECT_PLANNING_RUN_MODE_SET: ReadonlySet<string> = new Set(PROJECT_PLANNING_RUN_MODES)
const PROJECT_PLANNING_APPLY_MODE_SET: ReadonlySet<string> = new Set(PROJECT_PLANNING_APPLY_MODES)
const PROJECT_PLANNING_COMPLETE_TOOL_NAME = 'agent_complete'

const PROJECT_PLANNING_SYSTEM_PROMPT = [
  'projectPlanning：SSOT 是项目导航平铺节点和 description 需求沉淀；它只负责从用户需求生成模块、页面、子页面策划，不生成页面配置。',
  '边界：禁止写 rule.json、pagedata.json、script.js、style.css；禁止设计组件树、DataView、Vue 逻辑或样式。后续页面配置交给 pageDesign。',
  '工具规则：业务函数使用 OpenAI 标准 tool_call，function.name 直接是真实函数名，arguments 固定为 {"path":"/projectPlanning[projectId]","args":{...}}；不要在 arguments 根层传 functionName。',
  '生产规则：先 readPlanning 盘点当前项目，再 applyPlanning 写入项目需求和节点；缺少业务事实时用 human_question，不猜模块、页面或关系。',
  '验收规则：页面规划必须至少产生一个 page 或 sub-page，每个页面 description 必须能作为后续 pageDesign 的用户需求；完成时用 agent_complete({summary}) 申请收尾。',
].join('\n')

const PROJECT_PLANNING_INPUT_SCHEMA = SparkAiJson.paramsSchema({
  projectId: SparkAiJson.stringSchema('当前项目 ID。作为 projectPlanning 业务实例身份。', { minLength: 1 }),
  userRequirement: SparkAiJson.stringSchema('用户对项目/应用的原始需求。AI 需要将其拆解为项目模块和页面规划。', { minLength: 1 }),
  mode: SparkAiJson.enumSchema(PROJECT_PLANNING_RUN_MODES, '可选。策划模式：create 新建、extend 扩展、revise 修订。'),
}, ['projectId', 'userRequirement'], 'ProjectPlanning AI 业务启动输入。')

const PROJECT_PLANNING_NODE_SCHEMA = SparkAiJson.objectSchema({
  nodeId: SparkAiJson.stringSchema('项目导航节点 ID，必须稳定、唯一、可读，例如 student-grade。', { minLength: 1 }),
  parentNodeId: SparkAiJson.stringSchema('父节点 ID；根节点传 null 或省略。module/page 可挂在项目或模块下；sub-page 必须挂在 page/sub-page 下。', { nullable: true }),
  title: SparkAiJson.stringSchema('节点标题，用于导航展示。', { minLength: 1 }),
  nodeKind: SparkAiJson.enumSchema(['module', 'page', 'sub-page'], '规划节点类型。module 代表业务模块；page/sub-page 代表后续可进入 pageDesign 的页面。'),
  description: SparkAiJson.stringSchema('节点需求说明。页面节点的 description 是后续 pageDesign 的需求输入真源。', { minLength: 1 }),
  pageId: SparkAiJson.stringSchema('可选。page 节点的页面 ID；省略时使用 nodeId。sub-page 会使用 nodeId。'),
  icon: SparkAiJson.stringSchema('可选。导航图标名称。'),
  order: SparkAiJson.numberSchema('可选。同级排序权重。'),
  childPlacement: SparkAiJson.enumSchema(['header', 'sidebar', 'parent', 'flat'], '可选。模块或页面子项展示位置；不允许 toolbar/user-menu 系统区。'),
}, {
  required: ['nodeId', 'title', 'nodeKind', 'description'],
  additionalProperties: false,
  description: '项目规划节点。只允许导航规划字段，不允许 rule/pagedata/script/style。',
})

const PROJECT_PLANNING_NODES_SCHEMA = {
  ...SparkAiJson.arraySchema(PROJECT_PLANNING_NODE_SCHEMA, '要写入的模块、页面和子页面节点。'),
  minItems: 1,
}

const APPLY_PROJECT_PLANNING_SCHEMA = SparkAiJson.objectSchema({
  projectRequirement: SparkAiJson.stringSchema('可选。沉淀到项目级的总需求；通常取用户需求的结构化总结。'),
  mode: SparkAiJson.enumSchema(PROJECT_PLANNING_APPLY_MODES, '可选。merge 默认增量合并；replace 只保留本次规划节点和系统保留区。'),
  nodes: PROJECT_PLANNING_NODES_SCHEMA,
}, {
  required: ['nodes'],
  additionalProperties: false,
  description: '应用项目页面策划。只写项目节点和需求说明，不写页面配置。',
})

const PROJECT_PLANNING_ACTIONS: readonly AiModuleFunctionMetadata[] = [
  {
    name: 'readPlanning',
    description: '读取当前项目策划快照：项目需求、模块计划、页面计划和页面功能列表。',
    paramsSchema: SparkAiJson.noParamsSchema(),
    resultSchema: {
      projectPlanning: 'ProjectPlanningSnapshot — 当前项目模块和页面策划。',
    },
    usageRules: [
      '开始策划、修订策划或不确定当前状态时先调用。',
      '本函数只读项目节点和 description，不读取页面四文件配置。',
    ],
    failureModes: [],
    example: {},
  },
  {
    name: 'applyPlanning',
    description: '把用户需求拆解出的模块、页面和子页面规划写入项目导航节点。',
    paramsSchema: APPLY_PROJECT_PLANNING_SCHEMA,
    resultSchema: {
      projectPlanning: 'ProjectPlanningSnapshot — 写入后的项目策划快照。',
      changedNodeIds: 'string[] — 本次创建或更新的节点 ID。',
    },
    usageRules: [
      '只传 projectRequirement、mode、nodes；nodes 只能包含 nodeId/parentNodeId/title/nodeKind/description/pageId/icon/order/childPlacement。',
      '禁止传 rule、ruleJson、pagedata、pageDataJson、script、style、components、DataView 或 Vue 代码字段。',
      'module/page 可挂在项目或 module 下；sub-page 只能挂在 page 或 sub-page 下。',
      '每个 page/sub-page 的 description 必须足够后续 pageDesign 继续生成页面配置。',
      '写入后再次 readPlanning 复核页面列表和继承需求，再 agent_complete。',
    ],
    failureModes: [
      { code: 'SCHEMA_VALIDATION_FAILED', when: '参数含未声明字段或节点结构不合法', fix: '调用 module_function_guide 读取 schema，只保留规划字段后重试。' },
      { code: 'PROJECT_PLANNING_APPLY_FAILED', when: '父子关系非法、节点重复或 host 拒绝写入', fix: '根据错误消息修正节点层级、ID 或 mode 后重试。' },
    ],
    example: {
      projectRequirement: '建设学生成绩管理应用，覆盖成绩录入、查询、统计和异常预警。',
      mode: 'merge',
      nodes: [
        { nodeId: 'academic', title: '教务管理', nodeKind: 'module', description: '教务侧成绩与班级管理入口。' },
        { nodeId: 'student-grade', parentNodeId: 'academic', title: '学生成绩管理', nodeKind: 'page', description: '维护学生成绩，支持班级、科目筛选，录入分数并统计平均分。' },
      ],
    },
  },
]

class ProjectPlanningService {
  public constructor(private readonly options: ProjectPlanningModuleOptions) {}

  public readPlanning(context: ProjectPlanningServiceContext): ProjectPlanningServiceResult<ProjectPlanningSnapshot> {
    try {
      const snapshot = this.options.getPlanningEditHost(toRuntimeContext(context)).readProjectPlanning()
      return {
        ok: true,
        data: snapshot,
        summary: `项目 ${snapshot.projectId} 当前有 ${snapshot.pageFeatures.length} 个页面规划。`,
      }
    } catch (error) {
      return serviceFailure(
        'PROJECT_PLANNING_HOST_UNAVAILABLE',
        errorMessage(error),
        '请确认 DevSystem 已创建 ProjectEditor，并通过 createProjectPlanningEditHost 接入 projectPlanning。',
      )
    }
  }

  public async applyPlanning(
    context: ProjectPlanningServiceContext,
    args: AiJsonParams,
  ): Promise<ProjectPlanningServiceResult<ProjectPlanningApplyResult>> {
    try {
      const command = readProjectPlanningApplyCommand(args)
      const result = await this.options.getPlanningEditHost(toRuntimeContext(context)).applyProjectPlanning(command)
      return {
        ok: true,
        data: result,
        summary: `项目策划已写入：新增 ${result.createdNodeIds.length} 个节点，更新 ${result.updatedNodeIds.length} 个节点，页面 ${result.pageCount} 个。`,
      }
    } catch (error) {
      return serviceFailure(
        'PROJECT_PLANNING_APPLY_FAILED',
        errorMessage(error),
        '根据 module_function_guide 的参数契约修正节点字段、父子关系和 mode 后重试。',
      )
    }
  }
}

class ProjectPlanningAiModule extends AiModule {
  public constructor(private readonly service: ProjectPlanningService) {
    super({
      kind: PROJECT_PLANNING_MODULE_ID,
      name: '项目页面策划',
      description: '从用户需求生成项目模块、页面和子页面规划；不生成页面配置四文件。',
      functions: PROJECT_PLANNING_ACTIONS,
      find: (ctx, childKind, query) => {
        if (childKind !== PROJECT_PLANNING_MODULE_ID || ctx.segments.length !== 0) {
          return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
        }
        const ref = createCurrentProjectPlanningRef(ctx, query)
        return AiModuleResult.ok(ref === null ? [] : [ref])
      },
    })
  }

  protected override async runFunction(
    ctx: AiModulePathContext,
    actionName: string,
    args: AiJsonParams,
  ): Promise<AiModuleResult<AiJsonValue>> {
    if (this.findFunction(actionName) === undefined) {
      throw new Error(`${PROJECT_PLANNING_MODULE_ID} action is not declared: ${actionName}`)
    }
    switch (actionName) {
      case 'readPlanning':
        return this.serviceResultToOperationResult(this.service.readPlanning(toServiceContext(ctx)))
      case 'applyPlanning':
        return this.serviceResultToOperationResult(await this.service.applyPlanning(toServiceContext(ctx), args))
      default:
        throw new Error(`projectPlanning action runner is not registered: ${actionName}`)
    }
  }

  protected override createCurrentInstanceRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
    return createCurrentProjectPlanningRef(ctx, {})
  }
}

export function createProjectPlanningBusinessRegistration(
  options: ProjectPlanningModuleOptions,
): SparkAiAgent.AiAgentRegistration<ProjectPlanningRunInput> {
  return createAiAgentRegistration(createProjectPlanningBusinessKindDefinition(options))
}

export function createProjectPlanningBusinessKindDefinition(
  options: ProjectPlanningModuleOptions,
): SparkAiAgent.AiAgentDefinition<ProjectPlanningRunInput> {
  const runtime = new AiModuleRuntime()
  runtime.register(new ProjectPlanningAiModule(new ProjectPlanningService(options)))
  return {
    kindID: PROJECT_PLANNING_MODULE_ID,
    name: 'Project Planning',
    description: '项目页面策划生产线。',
    runtime,
    inputContract: {
      paramsSchema: PROJECT_PLANNING_INPUT_SCHEMA,
      identityField: 'projectId',
      normalize: normalizeProjectPlanningRunInput,
      toScope: (input) => createAiAgentScope(PROJECT_PLANNING_MODULE_ID, input.projectId),
      toOrchestration: createProjectPlanningOrchestration,
    },
    sessionStore: new DefaultAiAgentSessionStore(),
    systemPrompt: () => PROJECT_PLANNING_SYSTEM_PROMPT,
    beforeFunctionCall: (call) => validateProjectPlanningCompletionRequest(options, call),
  }
}

function normalizeProjectPlanningRunInput(input: AiJsonParams): ProjectPlanningRunInput {
  const normalized: {
    projectId: string
    userRequirement: string
    mode?: ProjectPlanningRunMode
  } = {
    projectId: requireRunInputText(input, 'projectId'),
    userRequirement: requireRunInputText(input, 'userRequirement'),
  }
  if (isProjectPlanningRunMode(input['mode'])) {
    normalized.mode = input['mode']
  }
  return normalized
}

function createProjectPlanningOrchestration(
  input: ProjectPlanningRunInput,
): SparkAiAgent.AiAgentOrchestrationPlan {
  const projectPath = `/${PROJECT_PLANNING_MODULE_ID}[${input.projectId}]`
  return {
    title: 'projectPlanning registered task orchestration',
    userMessage: input.userRequirement,
    systemPrompt: [
      '工具通道硬约束：所有 module_*、业务函数和完成动作必须通过 OpenAI function calling 的 tool_calls 发起；每次 assistant 响应的 tool_calls 数组长度必须为 1 且 assistant.content 为空；禁止用正文 JSON、代码块或伪函数调用代替工具调用。',
      `首轮只允许发起一个真实 tool_calls：function.name="module_find"，function.arguments=${JSON.stringify({
        path: '/',
        childKind: PROJECT_PLANNING_MODULE_ID,
        query: { id: input.projectId },
      })}。`,
      `实例确认后按 readPlanning(${JSON.stringify({ path: projectPath, args: {} })}) → applyPlanning({"path":${JSON.stringify(projectPath)},"args":{...}}) → readPlanning(${JSON.stringify({ path: projectPath, args: {} })}) 的闭环推进。`,
      '编排规则：依据用户需求、当前项目策划和工具返回结果自主拆解模块/页面；模块不是隔离步骤，需求事实要沉淀到 projectRequirement 与节点 description。',
      'SSOT 规则：项目节点和 description 是唯一真源；PageModel/PageNode/pageDesign 都是下游业务范例或后续工位。',
      '边界规则：本阶段只生成 module/page/sub-page 节点和导航属性；不生成 rule/pagedata/script/style，不设计组件、DataView、服务函数或 CSS。',
      '质量门禁：页面节点必须能被后续 pageDesign 直接消费，description 写清对象、核心动作、列表/表单/统计/流程等页面目标。',
      input.mode === undefined ? undefined : `模式边界：mode=${input.mode}。`,
      '缺少关键业务域、角色、页面边界或是否替换旧规划时，用 human_question 追问；不要猜。',
      '收尾规则：复核项目至少有一个页面规划且页面 description 非空后，调用 agent_complete({summary}) 申请收尾；若门禁拒绝，按 fix 继续修。',
    ].filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n'),
    readonlySteps: [
      'find current projectPlanning instance',
      'read current ProjectPlanningSnapshot',
      'apply module/page/sub-page planning only',
      'read planning again and verify page descriptions',
    ],
  }
}

function validateProjectPlanningCompletionRequest(
  options: ProjectPlanningModuleOptions,
  call: SparkAiAgent.AiAgentBeforeFunctionCallOptions,
): SparkAiAgent.AiAgentBeforeFunctionCallDirective {
  if (call.toolName !== PROJECT_PLANNING_COMPLETE_TOOL_NAME) return { status: 'allow' }
  const issues = inspectProjectPlanningCompletionIssues(options, call)
  if (issues.length === 0) return { status: 'allow' }
  return {
    status: 'reject',
    reason: 'projectPlanning final deliverable is not ready',
    fix: [
      `项目页面策划验收未通过：${issues.join('；')}。`,
      '不要结束当前任务；请继续通过 readPlanning/applyPlanning 修正项目节点和 description。',
    ].join(''),
  }
}

function inspectProjectPlanningCompletionIssues(
  options: ProjectPlanningModuleOptions,
  context: SparkAiAgent.AiAgentRuntimeContext,
): string[] {
  try {
    const snapshot = options.getPlanningEditHost({
      instanceId: context.instanceId,
      moduleId: PROJECT_PLANNING_MODULE_ID,
      moduleInstanceId: context.moduleInstanceId,
    }).readProjectPlanning()
    const issues: string[] = []
    if (snapshot.requirement.trim().length === 0) {
      issues.push('项目级需求尚未沉淀到 ProjectPlanningModel.requirement')
    }
    if (snapshot.pageFeatures.length === 0) {
      issues.push('尚未产生任何 page/sub-page 页面规划')
    }
    const missingDescriptions = snapshot.pageFeatures
      .filter(page => page.description.trim().length === 0)
      .map(page => page.pageId)
    if (missingDescriptions.length > 0) {
      issues.push(`页面 description 为空: ${missingDescriptions.join(', ')}`)
    }
    return issues
  } catch (error) {
    return [`ProjectPlanning edit host 不可用: ${errorMessage(error)}`]
  }
}

export type EnsureProjectPlanningBusinessOptions<TEntries extends SparkAiAgent.AiAgentHostEntryMap, TAlias extends string> = {
  readonly host: SparkAiAgent.AiAgentHost<TEntries>
  readonly alias?: TAlias
  readonly getProjectPlanningEditHost: (context: SparkAiAgent.AiAgentRuntimeContext) => ProjectPlanningEditHost
}

export type ProjectPlanningAiAgentEntry = Record<
  typeof PROJECT_PLANNING_AI_AGENT_HOST_ALIAS,
  SparkAiAgent.AiAgentRegistration<ProjectPlanningRunInput>
>

export function ensureProjectPlanningBusiness<TEntries extends SparkAiAgent.AiAgentHostEntryMap>(
  options: EnsureProjectPlanningBusinessOptions<TEntries, typeof PROJECT_PLANNING_AI_AGENT_HOST_ALIAS>,
): SparkAiAgent.AiAgentHost<TEntries & ProjectPlanningAiAgentEntry>
export function ensureProjectPlanningBusiness<TEntries extends SparkAiAgent.AiAgentHostEntryMap, TAlias extends string>(
  options: EnsureProjectPlanningBusinessOptions<TEntries, TAlias> & { readonly alias: TAlias },
): SparkAiAgent.AiAgentHost<TEntries & Record<TAlias, SparkAiAgent.AiAgentRegistration<ProjectPlanningRunInput>>>
export function ensureProjectPlanningBusiness<TEntries extends SparkAiAgent.AiAgentHostEntryMap, TAlias extends string>(
  options: EnsureProjectPlanningBusinessOptions<TEntries, TAlias>,
): SparkAiAgent.AiAgentHost<TEntries & Record<TAlias | typeof PROJECT_PLANNING_AI_AGENT_HOST_ALIAS, SparkAiAgent.AiAgentRegistration<ProjectPlanningRunInput>>> {
  const alias = options.alias ?? PROJECT_PLANNING_AI_AGENT_HOST_ALIAS
  return options.host.ensure(alias, {
    moduleId: PROJECT_PLANNING_MODULE_ID,
    create: () => createProjectPlanningBusinessRegistration({
      getPlanningEditHost: (context) => options.getProjectPlanningEditHost(context),
    }),
  })
}

function readProjectPlanningApplyCommand(args: AiJsonParams): ProjectPlanningApplyCommand {
  const nodesValue = args['nodes']
  if (!Array.isArray(nodesValue)) {
    throw new Error('applyPlanning.args.nodes must be an array.')
  }
  const projectRequirement = readOptionalString(args, 'projectRequirement')
  const modeValue = readOptionalString(args, 'mode')
  const command: {
    projectRequirement?: string
    mode?: ProjectPlanningApplyMode
    nodes: ProjectPlanningNodePlan[]
  } = {
    nodes: nodesValue.map(readProjectPlanningNodePlan),
  }
  if (projectRequirement !== undefined) command.projectRequirement = projectRequirement
  if (isProjectPlanningApplyMode(modeValue)) command.mode = modeValue
  return command
}

function readProjectPlanningNodePlan(value: AiJsonValue, index: number): ProjectPlanningNodePlan {
  if (!isRecord(value)) {
    throw new Error(`applyPlanning.args.nodes[${index}] must be an object.`)
  }
  const plan: {
    nodeId: string
    parentNodeId?: string | null
    title: string
    nodeKind: 'module' | 'page' | 'sub-page'
    description: string
    pageId?: string
    icon?: string
    order?: number
    childPlacement?: 'header' | 'sidebar' | 'parent' | 'flat'
  } = {
    nodeId: readRequiredString(value, 'nodeId', index),
    title: readRequiredString(value, 'title', index),
    nodeKind: readPlanningNodeKind(value, index),
    description: readRequiredString(value, 'description', index),
  }
  const parentNodeId = readOptionalString(value, 'parentNodeId')
  if (parentNodeId !== undefined) plan.parentNodeId = parentNodeId
  if (value['parentNodeId'] === null) plan.parentNodeId = null
  const pageId = readOptionalString(value, 'pageId')
  if (pageId !== undefined) plan.pageId = pageId
  const icon = readOptionalString(value, 'icon')
  if (icon !== undefined) plan.icon = icon
  const order = value['order']
  if (typeof order === 'number') plan.order = order
  const childPlacement = readChildPlacement(value, index)
  if (childPlacement !== undefined) plan.childPlacement = childPlacement
  return plan
}

function readPlanningNodeKind(value: Record<string, unknown>, index: number): 'module' | 'page' | 'sub-page' {
  const nodeKind = value['nodeKind']
  if (nodeKind === 'module' || nodeKind === 'page' || nodeKind === 'sub-page') return nodeKind
  throw new Error(`applyPlanning.args.nodes[${index}].nodeKind must be module, page, or sub-page.`)
}

function readChildPlacement(
  value: Record<string, unknown>,
  index: number,
): 'header' | 'sidebar' | 'parent' | 'flat' | undefined {
  const childPlacement = value['childPlacement']
  if (childPlacement === undefined) return undefined
  if (childPlacement === 'header' || childPlacement === 'sidebar' || childPlacement === 'parent' || childPlacement === 'flat') {
    return childPlacement
  }
  throw new Error(`applyPlanning.args.nodes[${index}].childPlacement is not allowed.`)
}

function readRequiredString(value: Record<string, unknown>, fieldName: string, index: number): string {
  const fieldValue = value[fieldName]
  if (typeof fieldValue !== 'string' || fieldValue.trim().length === 0) {
    throw new Error(`applyPlanning.args.nodes[${index}].${fieldName} must be a non-empty string.`)
  }
  return fieldValue.trim()
}

function readOptionalString(value: Record<string, unknown>, fieldName: string): string | undefined {
  const fieldValue = value[fieldName]
  if (typeof fieldValue !== 'string') return undefined
  const normalized = fieldValue.trim()
  return normalized.length === 0 ? undefined : normalized
}

function createCurrentProjectPlanningRef(
  ctx: AiModulePathContext,
  query: Readonly<Record<string, AiJsonValue>>,
): AiModuleInstanceRef | null {
  const queryId = typeof query['id'] === 'string' && query['id'].trim().length > 0
    ? query['id'].trim()
    : null
  const projectId = ctx.host?.moduleInstanceId ?? ctx.segment?.id ?? queryId
  if (projectId === null || projectId.length === 0) return null
  if (queryId !== null && queryId !== projectId) return null
  return {
    id: projectId,
    label: '当前项目页面策划',
    summary: 'ProjectPlanning 根模块实例，只处理项目节点规划。',
  }
}

function toServiceContext(
  ctx: AiModulePathContext | SparkAiAgent.AiAgentRuntimeContext,
): ProjectPlanningServiceContext {
  if ('host' in ctx || 'segments' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment?.id ?? '',
      projectId: pathCtx.host?.moduleInstanceId ?? pathCtx.segment?.id ?? '',
    }
  }
  return {
    requestId: ctx.instanceId,
    projectId: ctx.moduleInstanceId,
  }
}

function toRuntimeContext(context: ProjectPlanningServiceContext): ProjectPlanningRuntimeContext {
  return {
    instanceId: context.requestId,
    moduleId: PROJECT_PLANNING_MODULE_ID,
    moduleInstanceId: context.projectId,
  }
}

function requireRunInputText(input: AiJsonParams, fieldName: 'projectId' | 'userRequirement'): string {
  const value = input[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`projectPlanning input.${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function isProjectPlanningRunMode(value: AiJsonValue | undefined): value is ProjectPlanningRunMode {
  return typeof value === 'string' && PROJECT_PLANNING_RUN_MODE_SET.has(value)
}

function isProjectPlanningApplyMode(value: string | undefined): value is ProjectPlanningApplyMode {
  return value !== undefined && PROJECT_PLANNING_APPLY_MODE_SET.has(value)
}

function serviceFailure(code: string, msg: string, fix: string): ProjectPlanningServiceResult<never> {
  return { ok: false, code, msg, fix }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
