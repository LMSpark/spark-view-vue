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
  activateAgentWorkflowDefinition,
  createSimpleInputContract,
  ClassModelAgentAdapter,
  type AgentWorkflowDefinition,
  type AgentWorkflowProcess,
  type AgentWorkflowProcessKnowledgeRef,
  type AgentWorkflowProcessKnowledgeSourceKind,
  type AgentWorkflowProcessStageCompletion,
  type AgentWorkflowProcessStageConsideration,
  type AgentWorkflowProcessStageLlmTask,
  type AgentWorkflowProcessStageMetric,
  type AgentWorkflowProcessStageMetricOperator,
  type AgentWorkflowProcessStageModelSelection,
  type AgentWorkflowProcessStageParameterSource,
  type AgentWorkflowProcessStagePrerequisite,
  type AgentWorkflowProcessStageVerification,
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
const PROJECT_PLANNING_WORKFLOW_ID = 'agent.workflow.projectPlanning'
const PROJECT_PLANNING_REGISTRATION_BINDING_KEY = 'projectPlanning.registration'
const PROJECT_PLANNING_WORKFLOW_PUBLISHED_AT = '1970-01-01T00:00:00.000Z'
const PROJECT_PLANNING_PROCESS_SOURCE_REF = 'docs/architecture/PLATFORM_TENANT_ROUTING.md#项目策划'
const PROJECT_PLANNING_DTS_FILE_ROOT = 'generated/dts-class-model/files'

type ProjectPlanningKnowledgeRefOptions = Readonly<{
  refId: string
  title: string
  source: AgentWorkflowProcessKnowledgeSourceKind
  path: string
  usage: string
  symbols?: readonly string[]
}>

function projectPlanningMetric(
  metricId: string,
  title: string,
  operator: AgentWorkflowProcessStageMetricOperator,
  target: number,
  unit: string,
): AgentWorkflowProcessStageMetric {
  return { metricId, title, operator, target, unit }
}

function projectPlanningKnowledgeRef(
  options: ProjectPlanningKnowledgeRefOptions,
): AgentWorkflowProcessKnowledgeRef {
  return {
    refId: options.refId,
    title: options.title,
    source: options.source,
    path: options.path,
    ...(options.symbols === undefined || options.symbols.length === 0 ? {} : { symbols: options.symbols }),
    usage: options.usage,
  }
}

function projectPlanningConsideration(
  phaseId: AgentWorkflowProcessStageConsideration['phaseId'],
  title: string,
  checks: readonly string[],
  metrics: readonly AgentWorkflowProcessStageMetric[],
): AgentWorkflowProcessStageConsideration {
  return { phaseId, title, checks, metrics }
}

function projectPlanningPrerequisite(
  prerequisiteId: string,
  title: string,
  source: string,
  metrics: readonly AgentWorkflowProcessStageMetric[],
): AgentWorkflowProcessStagePrerequisite {
  return { prerequisiteId, title, source, metrics }
}

function projectPlanningModel(
  modelRole: string,
  modelRef: string,
  selectionReason: string,
  fallbackModelRefs: readonly string[] = [],
): AgentWorkflowProcessStageModelSelection {
  return {
    modelRole,
    modelRef,
    selectionReason,
    ...(fallbackModelRefs.length === 0 ? {} : { fallbackModelRefs }),
  }
}

function projectPlanningParameterSource(
  parameterId: string,
  title: string,
  source: string,
  path: string,
  required = true,
): AgentWorkflowProcessStageParameterSource {
  return { parameterId, title, source, path, required }
}

function projectPlanningLlmTask(
  objective: string,
  instructions: readonly string[],
  expectedOutput: readonly string[],
  forbidden: readonly string[] = [],
): AgentWorkflowProcessStageLlmTask {
  return {
    objective,
    instructions,
    expectedOutput,
    ...(forbidden.length === 0 ? {} : { forbidden }),
  }
}

function projectPlanningVerification(
  verificationId: string,
  title: string,
  method: string,
  metrics: readonly AgentWorkflowProcessStageMetric[],
): AgentWorkflowProcessStageVerification {
  return { verificationId, title, method, metrics }
}

function projectPlanningCompletion(
  criteria: readonly string[],
  nextWhen: string,
  stopWhen: string,
): AgentWorkflowProcessStageCompletion {
  return { criteria, nextWhen, stopWhen }
}

const PROJECT_PLANNING_KNOWLEDGE_REFS = {
  platformRouting: projectPlanningKnowledgeRef({
    refId: 'doc.platformRouting.projectPlanning',
    title: '平台项目节点与项目策划口径',
    source: 'document',
    path: PROJECT_PLANNING_PROCESS_SOURCE_REF,
    usage: '确定项目策划等于模块策划加页面策划，项目节点树是模块/页面入口事实源。',
  }),
  projectDeepDive: projectPlanningKnowledgeRef({
    refId: 'doc.projectDeepDive.planning',
    title: 'SPARK AppWorks 项目深度解析',
    source: 'document',
    path: 'docs/SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md#功能策划',
    usage: '确认 ProjectModel、ProjectDesign、ConfigPageNode 与功能策划的职责分层。',
  }),
  generatedManifest: projectPlanningKnowledgeRef({
    refId: 'generated.manifest',
    title: 'DTS ClassModel bundle manifest',
    source: 'generated-dts-class-model',
    path: 'generated/dts-class-model/manifest.json',
    usage: '定位项目策划可用的 ProjectModel、导航节点和项目类型知识 shard。',
  }),
  projectModel: projectPlanningKnowledgeRef({
    refId: 'generated.projectModel',
    title: 'ProjectModel',
    source: 'generated-dts-class-model',
    path: `${PROJECT_PLANNING_DTS_FILE_ROOT}/packages/spark-project-model/src/project/project-model.ts.json`,
    symbols: [
      'ProjectModel',
      'readProjectPlanningInput',
      'readNavigationPlanningInputs',
      'replaceNavigationChildren',
      'completeProjectPlanning',
    ],
    usage: '确认项目策划的输入、写入、完成门禁和 action 查询入口。',
  }),
  projectDesign: projectPlanningKnowledgeRef({
    refId: 'generated.projectDesign',
    title: 'ProjectDesign',
    source: 'generated-dts-class-model',
    path: `${PROJECT_PLANNING_DTS_FILE_ROOT}/packages/spark-project-model/src/project/project-design.ts.json`,
    symbols: ['ProjectDesign', 'replaceNavigationChildren', 'readPlanningProjection'],
    usage: '确认项目设计内容、导航 children 替换和 pageFeatures 投影边界。',
  }),
  projectTypes: projectPlanningKnowledgeRef({
    refId: 'generated.projectTypes',
    title: 'Project planning types',
    source: 'generated-dts-class-model',
    path: `${PROJECT_PLANNING_DTS_FILE_ROOT}/packages/spark-project-model/src/project/project-types.ts.json`,
    symbols: [
      'ProjectPlanningInput',
      'NavigationPlanningInput',
      'ProjectPlanningCompletionResult',
    ],
    usage: '确认项目级需求、导航节点策划输入和完成结果结构。',
  }),
  projectNode: projectPlanningKnowledgeRef({
    refId: 'generated.projectNode',
    title: 'ProjectNodeData',
    source: 'generated-dts-class-model',
    path: `${PROJECT_PLANNING_DTS_FILE_ROOT}/packages/spark-project-model/src/navigation/project-node.ts.json`,
    symbols: ['ProjectNodeData', 'ProjectModelData', 'ProjectPageNodeSummary'],
    usage: '确认 module/page 节点字段、description、path、children 和 pageFeatures 摘要结构。',
  }),
  navigationTree: projectPlanningKnowledgeRef({
    refId: 'generated.navigationTree',
    title: 'Navigation tree',
    source: 'generated-dts-class-model',
    path: `${PROJECT_PLANNING_DTS_FILE_ROOT}/packages/spark-project-model/src/navigation/navigation-tree.ts.json`,
    symbols: ['buildNavRoot', 'buildProjectPageSummaries', 'normalizeProjectNodeData'],
    usage: '确认导航树规范化、模块/页面树投影和 page summary 构建规则。',
  }),
  projectWorkspace: projectPlanningKnowledgeRef({
    refId: 'generated.projectWorkspace',
    title: 'ProjectWorkspace',
    source: 'generated-dts-class-model',
    path: `${PROJECT_PLANNING_DTS_FILE_ROOT}/packages/spark-project-model/src/project/project-workspace.ts.json`,
    symbols: ['ProjectWorkspace'],
    usage: '确认 Host Run / headless 策划保存导航的工作区边界。',
  }),
} as const

function createProjectPlanningClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
  })
}

const PROJECT_PLANNING_STAGE_CONSIDERATIONS = {
  intakeInventory: [
    projectPlanningConsideration('F0', '身份边界', ['projectPlanning 工艺对象明确', '本流程只策划项目节点树'], [
      projectPlanningMetric('projectIdResolvedCount', '已定位 projectId 数', 'gte', 1, 'project'),
      projectPlanningMetric('pageDesignMutationCount', '页面四文件修改次数', 'eq', 0, 'mutation'),
    ]),
    projectPlanningConsideration('F1', '原料盘点', ['项目级需求、附件和现有导航节点可读'], [
      projectPlanningMetric('projectRequirementLength', '项目需求字符数', 'gte', 1, 'char'),
      projectPlanningMetric('navigationInputReadCount', '导航策划输入读取次数', 'gte', 1, 'read'),
    ]),
    projectPlanningConsideration('F3', '工单契约', ['projectScopeKey、projectId、requirement 和 navigationNodes 齐全'], [
      projectPlanningMetric('missingRequiredInputCount', '缺失必填输入数', 'eq', 0, 'field'),
    ]),
  ],
  domainDecomposition: [
    projectPlanningConsideration('F1', '业务素材', ['从项目需求和节点需求抽取业务域'], [
      projectPlanningMetric('businessDomainCandidateCount', '业务域候选数', 'gte', 1, 'domain'),
    ]),
    projectPlanningConsideration('F2', '项目模型知识', ['使用 ProjectNodeData 和 NavigationPlanningInput 约束模块边界'], [
      projectPlanningMetric('generatedKnowledgeRefCount', 'generated 知识引用数', 'gte', 2, 'ref'),
    ]),
    projectPlanningConsideration('F5', '拆分治理', ['避免只有技术分层或空模块壳'], [
      projectPlanningMetric('emptyModuleShellCount', '空模块壳数量', 'eq', 0, 'module'),
    ]),
  ],
  pageTreePlanning: [
    projectPlanningConsideration('F3', '页面契约', ['每个主要模块至少包含页面概要'], [
      projectPlanningMetric('moduleWithPageCoveragePercent', '模块页面覆盖率', 'gte', 100, 'percent'),
    ]),
    projectPlanningConsideration('F5', '路由治理', ['节点 id/path 稳定且不冲突'], [
      projectPlanningMetric('duplicateNodeIdCount', '重复 nodeId 数', 'eq', 0, 'node'),
      projectPlanningMetric('duplicatePathCount', '重复 path 数', 'eq', 0, 'path'),
    ]),
    projectPlanningConsideration('F8', '工单推进', ['页面概要能交给 pageDesign 消费'], [
      projectPlanningMetric('pageDescriptionCoveragePercent', '页面 description 覆盖率', 'gte', 100, 'percent'),
    ]),
  ],
  nodeContract: [
    projectPlanningConsideration('F2', '节点知识', ['ProjectNodeData 字段语义已应用'], [
      projectPlanningMetric('projectNodeFieldCoveragePercent', '节点关键字段覆盖率', 'gte', 100, 'percent'),
    ]),
    projectPlanningConsideration('F3', '节点契约', ['module/page/path/description/children 关系明确'], [
      projectPlanningMetric('invalidNodeKindCount', '非法 nodeKind 数', 'eq', 0, 'node'),
      projectPlanningMetric('missingPagePathCount', '页面缺失 path 数', 'eq', 0, 'page'),
    ]),
    projectPlanningConsideration('F6', '策划验收', ['pageFeatures 可从节点树投影'], [
      projectPlanningMetric('pageFeatureProjectionCount', 'pageFeatures 投影数', 'gte', 1, 'page'),
    ]),
  ],
  modelWrite: [
    projectPlanningConsideration('F4', '写入工位', ['只通过 ProjectModel action 写导航策划'], [
      projectPlanningMetric('replaceNavigationChildrenCallCount', 'replaceNavigationChildren 调用数', 'gte', 1, 'call'),
      projectPlanningMetric('forbiddenPageDesignApiCallCount', '禁止 pageDesign API 调用数', 'eq', 0, 'call'),
    ]),
    projectPlanningConsideration('F6', '完成门禁', ['completeProjectPlanning 可通过'], [
      projectPlanningMetric('navigationDirtyCount', '导航 dirty 标记数', 'gte', 1, 'dirty'),
      projectPlanningMetric('pageNodeCount', '页面节点数', 'gte', 1, 'page'),
    ]),
  ],
  verifyDeliver: [
    projectPlanningConsideration('F6', '最终验收', ['导航树、页面节点和 pageFeatures 闭合'], [
      projectPlanningMetric('completionErrorCount', '完成门禁错误数', 'eq', 0, 'error'),
      projectPlanningMetric('pageNodeCount', '页面节点数', 'gte', 1, 'page'),
    ]),
    projectPlanningConsideration('F7', '设计交接', ['交接给运行时/Host Run，不在流程图设计调度实现'], [
      projectPlanningMetric('executionImplementationStepCount', '执行实现步骤数', 'eq', 0, 'step'),
    ]),
    projectPlanningConsideration('F9', '交付闭环', ['交付范围只包含 navigation/project planning 结果'], [
      projectPlanningMetric('navigationArtifactCount', '导航交付资产数', 'gte', 1, 'artifact'),
      projectPlanningMetric('pageFileArtifactCount', '页面四文件交付资产数', 'eq', 0, 'file'),
    ]),
  ],
} as const satisfies Record<string, readonly AgentWorkflowProcessStageConsideration[]>

export const PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS: AgentWorkflowProcess = {
  processId: 'projectPlanning.navigation-craft-process',
  title: '项目策划六段式节点树工艺',
  sourceRef: PROJECT_PLANNING_PROCESS_SOURCE_REF,
  principle: '流程图只表达项目策划工艺步骤；项目策划事实是模块策划加页面策划，落点是 ProjectModel navigation children；F0-F9 是每个步骤的工厂检查维度，不作为流程节点。',
  knowledgeSources: Object.values(PROJECT_PLANNING_KNOWLEDGE_REFS),
  stages: [
    {
      stageId: 'PP1.intake-inventory',
      title: '接单与需求盘点',
      sourceSteps: 'projectPlanning.intake',
      goal: '确认项目作用域、项目级需求、附件正文和现有导航策划输入。',
      knowledgeRefs: [
        PROJECT_PLANNING_KNOWLEDGE_REFS.platformRouting,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectDeepDive,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectModel,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectTypes,
      ],
      considerations: PROJECT_PLANNING_STAGE_CONSIDERATIONS.intakeInventory,
      prerequisites: [
        projectPlanningPrerequisite('PP1.pre.projectId', '项目定位已输入', 'runInput.projectId', [
          projectPlanningMetric('projectIdResolvedCount', '已定位 projectId 数', 'gte', 1, 'project'),
        ]),
        projectPlanningPrerequisite('PP1.pre.requirement', '项目需求可读', 'readProjectPlanningInput.requirement', [
          projectPlanningMetric('projectRequirementLength', '项目需求字符数', 'gte', 1, 'char'),
        ]),
      ],
      model: projectPlanningModel(
        'planning-intake',
        'llm.reasoning.default',
        '需要归纳项目级需求、附件正文和现有节点需求，优先使用推理模型。',
        ['llm.reasoning.fast'],
      ),
      parameterSources: [
        projectPlanningParameterSource('projectScopeKey', '项目策划 scope key', 'runInput', 'projectScopeKey'),
        projectPlanningParameterSource('projectId', '项目 ID', 'runInput', 'projectId'),
        projectPlanningParameterSource('requirement', '项目级需求', 'runInput', 'requirement'),
        projectPlanningParameterSource('navigationNodes', '现有导航节点策划输入', 'runInput', 'navigationNodes'),
      ],
      llmTask: projectPlanningLlmTask(
        '把项目需求转成项目策划工单，并完成现有导航节点盘点。',
        ['确认项目边界和策划目标', '读取项目级 requirement 与 navigationNodes', '识别缺失需求或附件正文'],
        ['projectScope', 'requirementSummary', 'navigationInventory', 'openQuestions'],
        ['调用 openPageDesign', '修改页面四文件'],
      ),
      verification: [
        projectPlanningVerification('PP1.verify.input', '输入验收', '检查必填输入、需求长度和导航节点读取结果。', [
          projectPlanningMetric('missingRequiredInputCount', '缺失必填输入数', 'eq', 0, 'field'),
          projectPlanningMetric('navigationInputReadCount', '导航策划输入读取次数', 'gte', 1, 'read'),
        ]),
      ],
      completion: projectPlanningCompletion(
        ['projectId 已解析', '项目需求非空', 'navigationNodes 可读', '页面四文件修改次数为 0'],
        '输入验收通过后进入业务域与模块拆分。',
        'projectId、requirement 或导航输入缺失时停止并请求澄清。',
      ),
      steps: [
        {
          stepId: 'PP1.1',
          title: '项目作用域定界',
          actions: ['定位 projectId', '读取 projectScopeKey', '确认本轮只处理项目节点树'],
          outputs: ['projectScope', 'planningBoundary'],
          checks: ['不进入 pageDesign 四文件', '不设计运行时调度实现'],
        },
        {
          stepId: 'PP1.2',
          title: '需求与现有节点盘点',
          actions: ['读取项目级 requirement', '读取附件正文', '盘点 navigationNodes'],
          outputs: ['requirementSummary', 'navigationInventory'],
          checks: ['项目级需求可追溯', '现有节点需求不丢失'],
        },
      ],
    },
    {
      stageId: 'PP2.domain-decomposition',
      title: '业务域与模块拆分',
      sourceSteps: 'projectPlanning.domain',
      goal: '从项目需求中拆出稳定业务域，并形成模块候选和边界说明。',
      knowledgeRefs: [
        PROJECT_PLANNING_KNOWLEDGE_REFS.platformRouting,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectNode,
        PROJECT_PLANNING_KNOWLEDGE_REFS.navigationTree,
      ],
      considerations: PROJECT_PLANNING_STAGE_CONSIDERATIONS.domainDecomposition,
      prerequisites: [
        projectPlanningPrerequisite('PP2.pre.inventory', '需求盘点已完成', 'PP1.requirementSummary', [
          projectPlanningMetric('projectRequirementLength', '项目需求字符数', 'gte', 1, 'char'),
        ]),
      ],
      model: projectPlanningModel(
        'business-domain-decomposition',
        'llm.reasoning.default',
        '需要从项目需求抽取业务域、模块边界和模块间关系，使用推理模型。',
      ),
      parameterSources: [
        projectPlanningParameterSource('requirementSummary', '项目需求摘要', 'PP1.output', 'requirementSummary'),
        projectPlanningParameterSource('navigationInventory', '现有节点盘点', 'PP1.output', 'navigationInventory'),
        projectPlanningParameterSource(
          'nodeGuides',
          'ProjectNodeData 与导航树知识',
          'generated-dts-class-model',
          `${PROJECT_PLANNING_KNOWLEDGE_REFS.projectNode.path},${PROJECT_PLANNING_KNOWLEDGE_REFS.navigationTree.path}`,
        ),
      ],
      llmTask: projectPlanningLlmTask(
        '输出业务域和模块拆分方案，保证每个模块都有页面消费价值。',
        ['抽取业务域', '合并重复模块', '为每个模块说明目标用户和核心任务'],
        ['businessDomains', 'modulePlan', 'moduleBoundaryReport'],
        ['只按技术层拆模块', '生成没有页面消费者的空模块壳'],
      ),
      verification: [
        projectPlanningVerification('PP2.verify.modules', '模块拆分验收', '检查业务域数量和空模块壳。', [
          projectPlanningMetric('businessDomainCandidateCount', '业务域候选数', 'gte', 1, 'domain'),
          projectPlanningMetric('emptyModuleShellCount', '空模块壳数量', 'eq', 0, 'module'),
        ]),
      ],
      completion: projectPlanningCompletion(
        ['至少 1 个业务域', '空模块壳数量为 0', '模块边界可解释'],
        '模块拆分验收通过后进入页面与子页面策划。',
        '模块边界不清或只有空模块壳时停止。',
      ),
      steps: [
        {
          stepId: 'PP2.1',
          title: '业务域识别',
          actions: ['从需求抽取业务域', '识别角色、对象和主流程', '合并重复业务域'],
          outputs: ['businessDomains'],
          checks: ['业务域能从需求追溯', '不是技术层命名'],
        },
        {
          stepId: 'PP2.2',
          title: '模块边界确定',
          actions: ['为业务域分配模块', '说明模块责任和边界', '标记后续页面候选'],
          outputs: ['modulePlan'],
          checks: ['每个模块至少有页面候选', '模块之间职责不重叠'],
        },
      ],
    },
    {
      stageId: 'PP3.page-tree-planning',
      title: '页面与子页面策划',
      sourceSteps: 'projectPlanning.pages',
      goal: '为每个主要模块规划页面和必要子页面，形成可交给 pageDesign 的页面概要。',
      knowledgeRefs: [
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectDeepDive,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectNode,
        PROJECT_PLANNING_KNOWLEDGE_REFS.navigationTree,
      ],
      considerations: PROJECT_PLANNING_STAGE_CONSIDERATIONS.pageTreePlanning,
      prerequisites: [
        projectPlanningPrerequisite('PP3.pre.modules', '模块候选已验收', 'PP2.modulePlan', [
          projectPlanningMetric('businessDomainCandidateCount', '业务域候选数', 'gte', 1, 'domain'),
        ]),
      ],
      model: projectPlanningModel(
        'page-tree-planning',
        'llm.reasoning.default',
        '需要把模块目标转成页面、子页面和路由结构，使用推理模型。',
      ),
      parameterSources: [
        projectPlanningParameterSource('modulePlan', '模块拆分方案', 'PP2.output', 'modulePlan'),
        projectPlanningParameterSource('projectNodeSchema', 'ProjectNodeData 字段结构', 'generated-dts-class-model', PROJECT_PLANNING_KNOWLEDGE_REFS.projectNode.path),
      ],
      llmTask: projectPlanningLlmTask(
        '输出 module/page 两级以上的页面树策划，并为每个页面写功能描述。',
        ['为每个模块规划主要页面', '必要时规划隐藏子页面', '生成稳定英文 id/path'],
        ['pageTreePlan', 'pageDescriptionPlan', 'routePlan'],
        ['只生成 module 不生成 page', '让 page 缺失 description 或 path'],
      ),
      verification: [
        projectPlanningVerification('PP3.verify.pages', '页面树验收', '检查模块页面覆盖、重复 id/path 和页面描述覆盖。', [
          projectPlanningMetric('moduleWithPageCoveragePercent', '模块页面覆盖率', 'gte', 100, 'percent'),
          projectPlanningMetric('duplicateNodeIdCount', '重复 nodeId 数', 'eq', 0, 'node'),
          projectPlanningMetric('duplicatePathCount', '重复 path 数', 'eq', 0, 'path'),
          projectPlanningMetric('pageDescriptionCoveragePercent', '页面 description 覆盖率', 'gte', 100, 'percent'),
        ]),
      ],
      completion: projectPlanningCompletion(
        ['模块页面覆盖率 100%', '重复 id/path 为 0', '页面 description 覆盖率 100%'],
        '页面树验收通过后进入节点契约细化。',
        '任一主要模块缺页面或页面概要不可交付时停止。',
      ),
      steps: [
        {
          stepId: 'PP3.1',
          title: '页面清单规划',
          actions: ['为模块生成页面清单', '确定页面目标和用户任务', '规划必要子页面'],
          outputs: ['pageList', 'subPagePlan'],
          checks: ['每个主要模块有 page', '页面不是空壳入口'],
        },
        {
          stepId: 'PP3.2',
          title: '路由与描述规划',
          actions: ['生成稳定 id/path', '写页面 description', '标记隐藏子页面'],
          outputs: ['routePlan', 'pageDescriptionPlan'],
          checks: ['id/path 不重复', 'description 足以约束后续 pageDesign'],
        },
      ],
    },
    {
      stageId: 'PP4.node-contract',
      title: '节点契约细化',
      sourceSteps: 'projectPlanning.node-contract',
      goal: '把模块/页面策划落实为 ProjectNodeData 结构契约。',
      knowledgeRefs: [
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectTypes,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectNode,
        PROJECT_PLANNING_KNOWLEDGE_REFS.navigationTree,
      ],
      considerations: PROJECT_PLANNING_STAGE_CONSIDERATIONS.nodeContract,
      prerequisites: [
        projectPlanningPrerequisite('PP4.pre.pageTree', '页面树方案已通过', 'PP3.pageTreePlan', [
          projectPlanningMetric('pageDescriptionCoveragePercent', '页面 description 覆盖率', 'gte', 100, 'percent'),
        ]),
      ],
      model: projectPlanningModel(
        'project-node-contract',
        'llm.reasoning.default',
        '需要把页面树方案转成合法 ProjectNodeData children 参数，使用推理模型。',
      ),
      parameterSources: [
        projectPlanningParameterSource('pageTreePlan', '页面树方案', 'PP3.output', 'pageTreePlan'),
        projectPlanningParameterSource('replaceNavigationChildrenSchema', 'replaceNavigationChildren 参数结构', 'model_action_guide', 'ProjectModel.replaceNavigationChildren'),
      ],
      llmTask: projectPlanningLlmTask(
        '形成可直接传给 replaceNavigationChildren 的 children 参数。',
        ['设置 nodeKind、title、description、path、children', '为模块设置 childPlacement', '保留必要权限/上下文字段'],
        ['projectNodeChildren', 'nodeContractReport'],
        ['查询 ProjectNodeData 当作 attribute', '让 page 节点缺少 path'],
      ),
      verification: [
        projectPlanningVerification('PP4.verify.contract', '节点契约验收', '检查 nodeKind、path、description 和 pageFeatures 投影。', [
          projectPlanningMetric('projectNodeFieldCoveragePercent', '节点关键字段覆盖率', 'gte', 100, 'percent'),
          projectPlanningMetric('invalidNodeKindCount', '非法 nodeKind 数', 'eq', 0, 'node'),
          projectPlanningMetric('missingPagePathCount', '页面缺失 path 数', 'eq', 0, 'page'),
          projectPlanningMetric('pageFeatureProjectionCount', 'pageFeatures 投影数', 'gte', 1, 'page'),
        ]),
      ],
      completion: projectPlanningCompletion(
        ['节点关键字段覆盖率 100%', '非法 nodeKind 为 0', '页面缺失 path 为 0', 'pageFeatures 可投影'],
        '节点契约验收通过后进入模型写入与完成门禁。',
        'ProjectNodeData 结构不闭合或 pageFeatures 不可投影时停止。',
      ),
      steps: [
        {
          stepId: 'PP4.1',
          title: 'children 参数成型',
          actions: ['构造 module/page children', '设置 nodeKind/title/path/description', '补 childPlacement'],
          outputs: ['projectNodeChildren'],
          checks: ['children 是 ProjectNodeData[]', 'module 下有 page children'],
        },
        {
          stepId: 'PP4.2',
          title: '节点字段验收',
          actions: ['校验 nodeKind', '校验 path 和 description', '预测 pageFeatures 投影'],
          outputs: ['nodeContractReport'],
          checks: ['page 节点 path 非空', 'description 可被 pageDesign 消费'],
        },
      ],
    },
    {
      stageId: 'PP5.model-write',
      title: '模型写入与完成门禁',
      sourceSteps: 'projectPlanning.write',
      goal: '通过 ProjectModel action 写入导航 children，并触发 projectPlanning 完成门禁。',
      knowledgeRefs: [
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectModel,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectDesign,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectTypes,
      ],
      considerations: PROJECT_PLANNING_STAGE_CONSIDERATIONS.modelWrite,
      prerequisites: [
        projectPlanningPrerequisite('PP5.pre.children', 'children 参数已验收', 'PP4.projectNodeChildren', [
          projectPlanningMetric('invalidNodeKindCount', '非法 nodeKind 数', 'eq', 0, 'node'),
        ]),
      ],
      model: projectPlanningModel(
        'model-script-writer',
        'llm.code.default',
        '需要生成 model_script 函数体并调用 ProjectModel action，使用代码模型。',
        ['llm.reasoning.default'],
      ),
      parameterSources: [
        projectPlanningParameterSource('projectNodeChildren', '已验收 children 参数', 'PP4.output', 'projectNodeChildren'),
        projectPlanningParameterSource('projectModelActions', 'ProjectModel action 知识', 'model_action_guide', 'readProjectPlanningInput,readNavigationPlanningInputs,replaceNavigationChildren'),
      ],
      llmTask: projectPlanningLlmTask(
        '生成并执行 model_script，把项目策划写入 ProjectModel navigation children。',
        ['读取 readProjectPlanningInput/readNavigationPlanningInputs', '调用 replaceNavigationChildren({ children })', '返回 navigationRoot 和节点统计'],
        ['modelScript', 'navigationRoot', 'writeReport'],
        ['调用 openPageDesign', '直接写四文件', '在 model_script 中调用 completeProjectPlanning'],
      ),
      verification: [
        projectPlanningVerification('PP5.verify.write', '模型写入验收', '检查 replaceNavigationChildren、navigationDirty 和 page 节点数量。', [
          projectPlanningMetric('replaceNavigationChildrenCallCount', 'replaceNavigationChildren 调用数', 'gte', 1, 'call'),
          projectPlanningMetric('forbiddenPageDesignApiCallCount', '禁止 pageDesign API 调用数', 'eq', 0, 'call'),
          projectPlanningMetric('navigationDirtyCount', '导航 dirty 标记数', 'gte', 1, 'dirty'),
          projectPlanningMetric('pageNodeCount', '页面节点数', 'gte', 1, 'page'),
        ]),
      ],
      completion: projectPlanningCompletion(
        ['replaceNavigationChildren 至少调用 1 次', '禁止 pageDesign API 调用数为 0', '页面节点数不少于 1'],
        '模型写入验收通过后进入交叉校验与交付。',
        '未写 navigation、只有模块壳或误调用 pageDesign API 时停止。',
      ),
      steps: [
        {
          stepId: 'PP5.1',
          title: 'ProjectModel action 写入',
          actions: ['查询 action guide', '执行 model_script', '调用 replaceNavigationChildren'],
          outputs: ['navigationRoot', 'writeReport'],
          checks: ['根对象是 this(ProjectModel)', '不调用页面四文件 API'],
        },
        {
          stepId: 'PP5.2',
          title: '完成门禁预检',
          actions: ['检查 navigationDirty', '统计 page 节点', '准备 agent_complete summary'],
          outputs: ['completionReadiness'],
          checks: ['page 节点不少于 1', 'completeProjectPlanning 不在 model_script 中调用'],
        },
      ],
    },
    {
      stageId: 'PP6.verify-deliver',
      title: '交叉校验与策划交付',
      sourceSteps: 'projectPlanning.verify',
      goal: '完成项目节点树、pageFeatures 和 Host Run 交付范围校验。',
      knowledgeRefs: [
        PROJECT_PLANNING_KNOWLEDGE_REFS.platformRouting,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectModel,
        PROJECT_PLANNING_KNOWLEDGE_REFS.projectWorkspace,
      ],
      considerations: PROJECT_PLANNING_STAGE_CONSIDERATIONS.verifyDeliver,
      prerequisites: [
        projectPlanningPrerequisite('PP6.pre.write', '导航写入已完成', 'PP5.writeReport', [
          projectPlanningMetric('pageNodeCount', '页面节点数', 'gte', 1, 'page'),
        ]),
      ],
      model: projectPlanningModel(
        'planning-verification',
        'llm.reasoning.default',
        '需要解释完成门禁、交付范围和后续 pageDesign 输入，使用推理模型。',
      ),
      parameterSources: [
        projectPlanningParameterSource('completionResult', 'completeProjectPlanning 结果', 'agent_complete', 'ProjectModel.completeProjectPlanning'),
        projectPlanningParameterSource('navigationRoot', '导航树根', 'ProjectModel', 'navigationRoot'),
        projectPlanningParameterSource('pageFeatures', '页面策划投影', 'ProjectModel', 'readPlanningProjection'),
      ],
      llmTask: projectPlanningLlmTask(
        '验证项目策划产物是否正确，并形成可交给 pageDesign 的摘要。',
        ['检查 module/page 两级结构', '检查 pageFeatures 可消费', '输出导航交付摘要和剩余风险'],
        ['completionReport', 'pageDesignHandoff', 'deliverySummary', 'residualRisk'],
        ['宣布已生成页面四文件', '设计保存/回滚实现'],
      ),
      verification: [
        projectPlanningVerification('PP6.verify.delivery', '最终交付验收', 'completeProjectPlanning 通过且交付范围只包含 navigation。', [
          projectPlanningMetric('completionErrorCount', '完成门禁错误数', 'eq', 0, 'error'),
          projectPlanningMetric('navigationArtifactCount', '导航交付资产数', 'gte', 1, 'artifact'),
          projectPlanningMetric('pageFileArtifactCount', '页面四文件交付资产数', 'eq', 0, 'file'),
          projectPlanningMetric('executionImplementationStepCount', '执行实现步骤数', 'eq', 0, 'step'),
        ]),
      ],
      completion: projectPlanningCompletion(
        ['完成门禁错误数为 0', '导航交付资产数不少于 1', '页面四文件交付资产数为 0', '执行实现步骤数为 0'],
        '最终验收通过后结束项目策划工艺流程图定型候选。',
        '完成门禁失败、pageFeatures 不可消费或交付范围越界时回到对应前序阶段修正。',
      ),
      steps: [
        {
          stepId: 'PP6.1',
          title: '完成门禁校验',
          actions: ['触发 agent_complete', '读取 completeProjectPlanning 结果', '按 missingFacts 回补'],
          outputs: ['completionReport'],
          checks: ['PROJECT_PLANNING_NAVIGATION_NOT_WRITTEN 为 0', 'PROJECT_PLANNING_PAGE_NODES_MISSING 为 0'],
        },
        {
          stepId: 'PP6.2',
          title: '交付与 pageDesign 交接',
          actions: ['总结 module/page 树', '列出 pageFeatures', '说明后续 pageDesign 输入'],
          outputs: ['deliverySummary', 'pageDesignHandoff'],
          checks: ['只交付 navigation/project planning', '不声明已完成页面四文件'],
        },
      ],
    },
  ],
}

/** Project Planning Run Input 的输入数据。 */
export type ProjectPlanningRunInput = Readonly<{
  /** 租户标识；用于后端附件读取 scope 校验。 */
  tenantId?: string
  /** 项目唯一标识。 */
  projectId: string
  /** 项目级短需求；来自 readProjectPlanningInput().requirement。 */
  requirement: string
  /** 项目级策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 各导航节点策划输入（含模块/页面）。 */
  navigationNodes: readonly NavigationPlanningRunInput[]
}>

/** Host inputContract 用可变数组，满足 AiJsonParams。 */
export type ProjectPlanningAgentInput = Readonly<{
  /** 租户标识；用于后端附件读取 scope 校验。 */
  tenantId?: string
  /** Agent 输入的身份键（通常等于 projectId）。 */
  projectScopeKey: string
  /** 项目唯一标识。 */
  projectId: string
  /** 项目级策划短需求文本。 */
  requirement: string
  /** 项目级策划详细说明附件引用。 */
  planningAttachmentRef?: string
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
}>

/** Resolve Project Planning Run Input Options 的调用配置。 */
export type ResolveProjectPlanningRunInputOptions = Readonly<{
  /** Host Run 可注入一次性需求，不写回 ProjectModel。 */
  requirementOverride?: string
  /** Host Run 或导入入口可注入一次性附件引用，不写回 ProjectModel。 */
  planningAttachmentRef?: string
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
  /** Node/E2E 可注入非 Worker knowledge provider；浏览器生产默认使用 Worker provider。 */
  knowledge?: ClassModelKnowledgeProvider
}>

export function resolveProjectPlanningRunInput(
  project: ProjectModel,
  options: ResolveProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const planning = project.readProjectPlanningInput()
  const overrideRequirement = options.requirementOverride?.trim()
  const attachmentRefOverride = options.planningAttachmentRef?.trim()
  const planningAttachmentRef = attachmentRefOverride !== undefined && attachmentRefOverride.length > 0
    ? attachmentRefOverride
    : planning.planningAttachmentRef
  const requirement = overrideRequirement !== undefined && overrideRequirement.length > 0
    ? overrideRequirement
    : (planning.requirement.trim().length > 0
      ? planning.requirement.trim()
      : (planningAttachmentRef === undefined
        ? ''
        : '请读取项目策划附件，基于附件内容生成项目模块与页面策划概要。'))
  if (requirement.length === 0 && planningAttachmentRef === undefined) {
    throw new Error('projectPlanning: requirement is empty; set navigation root description, project.description, or planningAttachmentRef.')
  }
  const navigationNodes = project.readNavigationPlanningInputs().map((node) => {
    return {
      nodeId: node.nodeId,
      title: node.title,
      nodeKind: node.nodeKind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    }
  })

  return {
    ...(project.tenantId === undefined ? {} : { tenantId: project.tenantId }),
    projectId: project.projectId,
    requirement,
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
    navigationNodes,
  }
}

export function resolveNavigationPlanningRunInput(
  project: ProjectModel,
  nodeId: string,
): NavigationPlanningRunInput {
  const node = project.readNavigationNodePlanningInput(nodeId)
  return {
    nodeId: node.nodeId,
    title: node.title,
    nodeKind: node.nodeKind,
    requirement: node.requirement,
    ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
  }
}

export function formatProjectPlanningPromptContext(input: ProjectPlanningRunInput): string {
  const lines = [
    '项目策划输入（短需求 + 附件详细说明）：',
    '策划阶段不涉及四文件，只产出导航/页面概要。',
    ...(input.tenantId === undefined ? [] : [`tenantId: ${input.tenantId}`]),
    `projectId: ${input.projectId}`,
    'projectRequirement:',
    input.requirement,
  ]
  if (input.planningAttachmentRef !== undefined) {
    lines.push(`projectPlanningAttachmentRef: ${input.planningAttachmentRef}`)
  }
  if (input.navigationNodes.length > 0) {
    lines.push('', 'navigationNodes:')
    for (const node of input.navigationNodes) {
      lines.push(`- ${node.nodeId} (${node.nodeKind}) ${node.title}`)
      if (node.requirement.length > 0) lines.push(`  requirement: ${node.requirement}`)
      if (node.planningAttachmentRef !== undefined) {
        lines.push(`  planningAttachmentRef: ${node.planningAttachmentRef}`)
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
    ...(scoped.tenantId === undefined ? {} : { tenantId: scoped.tenantId }),
    projectScopeKey: scoped.projectId,
    projectId: scoped.projectId,
    requirement: scoped.requirement,
    ...(scoped.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: scoped.planningAttachmentRef }),
    navigationNodes: scoped.navigationNodes.map((node) => ({
      nodeId: node.nodeId,
      title: node.title,
      nodeKind: node.nodeKind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    })),
  }
}

export function ensureProjectPlanningBusiness(options: EnsureProjectPlanningBusinessOptions): AiAgentHost {
  return activateAgentWorkflowDefinition({
    host: options.host,
    definition: createProjectPlanningAgentWorkflowDefinition(),
    bindings: {
      registrations: {
        [PROJECT_PLANNING_REGISTRATION_BINDING_KEY]: {
          moduleId: PROJECT_PLANNING_MODULE_ID,
          create: () => createProjectPlanningRegistration(options),
        },
      },
    },
  })
}

export function createProjectPlanningAgentWorkflowDefinition(): AgentWorkflowDefinition {
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: PROJECT_PLANNING_WORKFLOW_ID,
    source: {
      designKind: 'agent.workflow.design',
      designId: PROJECT_PLANNING_WORKFLOW_ID,
      designVersion: 1,
    },
    process: PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS,
    factory: {
      identity: {
        phaseId: 'F0',
        phase: 'identity',
        sectionPath: 'factory.identity',
        publishPath: 'workflow.factory.identity',
        value: {
          alias: PROJECT_PLANNING_MODULE_ID,
          moduleId: PROJECT_PLANNING_MODULE_ID,
          rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
          display: {
            name: '项目策划工厂',
            description: '以项目节点树为交付物，生产模块与页面策划概要。',
          },
          boundary: {
            ownsMutation: ['ProjectModel.navigationRoot'],
            forbiddenScenes: ['page-design-four-file-mutation', 'runtime-scheduling-inside-workflow-definition'],
          },
        },
      },
      materials: {
        phaseId: 'F1',
        phase: 'materials',
        sectionPath: 'factory.materials',
        publishPath: 'workflow.factory.materials',
        value: {
          moduleClass: 'ProjectModel',
          editorResolver: 'getProjectPlanningEditor',
          domainRoot: {
            className: 'ProjectModel',
            readActions: ['readProjectPlanningInput', 'readNavigationPlanningInputs'],
            writeAction: 'replaceNavigationChildren',
            completionAction: 'completeProjectPlanning',
          },
          artifacts: {
            editableModels: ['navigationRoot'],
            downstreamPlanningProjection: 'pageFeatures',
          },
        },
      },
      knowledge: {
        phaseId: 'F2',
        phase: 'knowledge',
        sectionPath: 'factory.knowledge',
        publishPath: 'workflow.factory.knowledge',
        value: {
          rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
          provider: 'dtsClassModelWorker',
          processRef: PROJECT_PLANNING_PROCESS_SOURCE_REF,
          closure: {
            requiredKinds: ['ProjectModel', 'ProjectNodeData', 'ProjectModelData', 'ProjectPlanningInput'],
            requiredActions: [
              'readProjectPlanningInput',
              'readNavigationPlanningInputs',
              'replaceNavigationChildren',
              'completeProjectPlanning',
            ],
          },
          craftPrinciples: [
            'project-planning-equals-module-plus-page-planning',
            'navigation-tree-as-project-fact',
            'module-must-contain-page',
            'page-description-handoff-to-pageDesign',
          ],
        },
      },
      contract: {
        phaseId: 'F3',
        phase: 'contract',
        sectionPath: 'factory.contract',
        publishPath: 'workflow.factory.contract',
        value: {
          identityField: 'projectScopeKey',
          messageField: 'requirement',
          input: {
            requiredFields: ['projectScopeKey', 'projectId', 'requirement', 'navigationNodes'],
            optionalFields: ['tenantId', 'planningAttachmentRef'],
          },
          orchestration: {
            planningSource: 'readProjectPlanningInput.requirement',
            scopeKey: 'projectScopeKey',
          },
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
          agentCompleteMethodName: 'completeProjectPlanning',
          stationSpec: {
            role: 'runtime-consumer-spec',
            workflowResponsibility: 'declare-required-tools-only',
            runtimeResponsibility: 'Host/Registration/ToolLoop/model_script execute this craft outside definition',
          },
        },
      },
      governance: {
        phaseId: 'F5',
        phase: 'governance',
        sectionPath: 'factory.governance',
        publishPath: 'workflow.factory.governance',
        value: {
          beforeFunctionCall: 'projectPlanningToolGate',
          toolLoopNudge: 'projectPlanning',
          craftDiscipline: {
            forbidPageDesignFourFiles: true,
            requireNavigationChildrenWrite: true,
            requireModuleWithPageChildren: true,
            modelScriptEntry: 'this.replaceNavigationChildren({ children })',
          },
          recovery: {
            planWithoutTool: 'force-tool-call',
            modelScriptFailure: 'read-recovery-hint-and-retry',
            completionFailure: 'repair-navigation-children-and-complete-again',
          },
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
          processAcceptance: {
            requiredStageIds: PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS.stages.map(stage => stage.stageId),
            requiredClosures: [
              'project-requirement-navigation-input-closure',
              'module-page-tree-closure',
              'project-node-contract-closure',
              'completeProjectPlanning-closure',
            ],
          },
        },
      },
      activation: {
        phaseId: 'F7',
        phase: 'activation',
        sectionPath: 'factory.activation',
        publishPath: 'workflow.factory.activation',
        value: {
          registrationBindingKey: PROJECT_PLANNING_REGISTRATION_BINDING_KEY,
          handoff: {
            target: 'runtime-binding',
            workflowDoesNotActivateHost: true,
            bindingRef: PROJECT_PLANNING_REGISTRATION_BINDING_KEY,
          },
        },
      },
      workOrder: {
        phaseId: 'F8',
        phase: 'workOrder',
        sectionPath: 'factory.workOrder',
        publishPath: 'workflow.factory.workOrder',
        value: {
          hostRunAlias: PROJECT_PLANNING_MODULE_ID,
          productionProcess: {
            processId: PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS.processId,
            stageIds: PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS.stages.map(stage => stage.stageId),
            mode: 'progressive-navigation-craft',
          },
        },
      },
      delivery: {
        phaseId: 'F9',
        phase: 'delivery',
        sectionPath: 'factory.delivery',
        publishPath: 'workflow.factory.delivery',
        value: {
          mode: 'appDeliveryPort',
          owner: 'projectPlanningHostRunProvider',
          deliveryRules: {
            artifactScope: ['navigationRoot'],
            workflowDoesNotSaveArtifacts: true,
            pageDesignFourFileArtifacts: [],
          },
        },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: PROJECT_PLANNING_WORKFLOW_PUBLISHED_AT,
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function createProjectPlanningRegistration(options: EnsureProjectPlanningBusinessOptions) {
  return ClassModelAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      options: {
        moduleId: PROJECT_PLANNING_MODULE_ID,
        rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
        dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
        knowledge: options.knowledge ?? createProjectPlanningClassModelKnowledgeProvider(),
        inputContract: createSimpleInputContract<ProjectPlanningAgentInput>({
          businessId: PROJECT_PLANNING_MODULE_ID,
          identityField: 'projectScopeKey',
          messageField: 'requirement',
          paramsSchema: {
            type: 'object',
            properties: {
              tenantId: { type: 'string' },
              projectScopeKey: { type: 'string' },
              projectId: { type: 'string' },
              requirement: { type: 'string' },
              planningAttachmentRef: { type: 'string' },
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
    '附件规则: 如果上下文出现 projectPlanningAttachmentRef，后端会在本轮 LLM 调用前临时解析 Word 并追加 [projectPlanningAttachmentText]；策划必须优先基于该正文，前端和项目模型只保存附件引用。',
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
