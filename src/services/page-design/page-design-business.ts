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
const PAGE_DESIGN_PROCESS_SOURCE_REF = 'docs/ai/DATASET_PAGE_DESIGN_AI_FLOW_100_STEPS_ZH.md#10'
const PAGE_DESIGN_DTS_FILE_ROOT = 'generated/dts-class-model/files'

type PageDesignKnowledgeRefOptions = Readonly<{
  refId: string
  title: string
  source: AgentWorkflowProcessKnowledgeSourceKind
  path: string
  usage: string
  symbols?: readonly string[]
}>

function pageDesignKnowledgeRef(options: PageDesignKnowledgeRefOptions): AgentWorkflowProcessKnowledgeRef {
  return {
    refId: options.refId,
    title: options.title,
    source: options.source,
    path: options.path,
    ...(options.symbols === undefined || options.symbols.length === 0 ? {} : { symbols: options.symbols }),
    usage: options.usage,
  }
}

const PAGE_DESIGN_KNOWLEDGE_REFS = {
  pageDesign100: pageDesignKnowledgeRef({
    refId: 'doc.pageDesign100',
    title: '页面设计 100 步工艺',
    source: 'document',
    path: PAGE_DESIGN_PROCESS_SOURCE_REF,
    usage: '确定七段式页面设计工艺主线、步骤边界和验收闭环。',
  }),
  generatedManifest: pageDesignKnowledgeRef({
    refId: 'generated.manifest',
    title: 'DTS ClassModel bundle manifest',
    source: 'generated-dts-class-model',
    path: 'generated/dts-class-model/manifest.json',
    usage: '定位页面设计可用的模型、组件、工具和脚本知识 shard。',
  }),
  projectModel: pageDesignKnowledgeRef({
    refId: 'generated.projectModel',
    title: 'ProjectModel',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-project-model/src/project/project-model.ts.json`,
    symbols: ['ProjectModel'],
    usage: '确认 pageDesign 入口、规划投影和 openPageDesign 页面模型入口。',
  }),
  configPageNode: pageDesignKnowledgeRef({
    refId: 'generated.configPageNode',
    title: 'ConfigPageNode',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-project-model/src/page/config-page.ts.json`,
    symbols: ['ConfigPageNode', 'editDataSet', 'editNodeTree', 'setFileText'],
    usage: '确认 rule/pagedata/script/style 四文件内存模型和编辑 API 边界。',
  }),
  dataSet: pageDesignKnowledgeRef({
    refId: 'generated.dataSet',
    title: 'DataSet',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-data/src/dataset.ts.json`,
    symbols: ['DataSet'],
    usage: '确认 pagedata 根模型、序列化和 DataTable/DataView 聚合边界。',
  }),
  dataTable: pageDesignKnowledgeRef({
    refId: 'generated.dataTable',
    title: 'DataTable',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-data/src/data-table.ts.json`,
    symbols: ['DataTable'],
    usage: '确认表、字段、rows、API 和 crudConfig 的结构依据。',
  }),
  dataView: pageDesignKnowledgeRef({
    refId: 'generated.dataView',
    title: 'DataView',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-data/src/data-view.ts.json`,
    symbols: ['DataView'],
    usage: '确认页面数据消费、视图状态隔离、分页、筛选和选择状态语义。',
  }),
  dataViewKey: pageDesignKnowledgeRef({
    refId: 'generated.dataViewKey',
    title: 'DataViewKey',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-data/src/core/data-view-key.ts.json`,
    symbols: ['DataViewKeyDescriptor', 'DataViewMemberDescriptor', 'DataMember'],
    usage: '确认 dataViewKey、dataMember、dataField 分离规则和绑定校验依据。',
  }),
  dataSetCrudTool: pageDesignKnowledgeRef({
    refId: 'generated.dataSetCrudTool',
    title: 'DataSetCrudTool',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-data/src/dataset-crud-tool.ts.json`,
    symbols: [
      'DataSetCrudTool',
      'DataSetCrudToolCreateTableOptions',
      'DataSetCrudToolCreateRelationParams',
      'DataSetCrudToolCreateDependencyParams',
    ],
    usage: '确认 DataTable、Relation、DataView 和 ViewDependency 的结构化修改参数。',
  }),
  sparkNodeTree: pageDesignKnowledgeRef({
    refId: 'generated.sparkNodeTree',
    title: 'SparkNodeTree',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-project-model/src/node-tree/spark-node-tree.ts.json`,
    symbols: ['SparkNodeTree'],
    usage: '确认 rule.json 节点树的增删改和 parentId/items 结构规则。',
  }),
  sparkNode: pageDesignKnowledgeRef({
    refId: 'generated.sparkNode',
    title: 'SparkNode',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-project-model/src/node-tree/spark-node.ts.json`,
    symbols: ['SparkNode'],
    usage: '确认页面节点属性、组件类型、事件和样式 class 的节点载体。',
  }),
  pageDataDesigner: pageDesignKnowledgeRef({
    refId: 'generated.pageDataDesigner',
    title: 'Page data designer projection',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/src/services/project-model-artifacts/page-data-designer.ts.json`,
    symbols: ['DesignerTableProjection', 'DesignerRelationProjection'],
    usage: '确认设计器侧可见的 pagedata 投影、表关系和页面数据摘要。',
  }),
  ruleEditor: pageDesignKnowledgeRef({
    refId: 'generated.ruleEditor',
    title: 'Rule editor projection',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/src/services/project-model-artifacts/rule-editor.ts.json`,
    usage: '确认 rule 设计器可见的节点树、绑定和编辑投影。',
  }),
  sparkPageRenderer: pageDesignKnowledgeRef({
    refId: 'generated.sparkPageRenderer',
    title: 'SparkPageRenderer',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/page/renderer/SparkPageRenderer.vue.json`,
    symbols: ['PageRuntimeErrorPhase', 'PageRuntimeErrorPayload'],
    usage: '确认预览/渲染错误阶段和最终交叉校验反馈来源。',
  }),
  viewDataSource: pageDesignKnowledgeRef({
    refId: 'generated.viewDataSource',
    title: 'Container data source',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/data-views/view-data-source.ts.json`,
    symbols: ['UseContainerDataSourceOptions', 'ContainerDataSourceState'],
    usage: '确认数据容器如何消费 DataView、rows/currentRow/selectedRows 和请求状态。',
  }),
  rendererTable: pageDesignKnowledgeRef({
    refId: 'generated.rendererTable',
    title: 'RendererTable props',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.props.ts.json`,
    symbols: ['RTableProps', 'RendererTable'],
    usage: '确认表格容器的数据源、分页、工具栏和 actions 参数。',
  }),
  rendererForm: pageDesignKnowledgeRef({
    refId: 'generated.rendererForm',
    title: 'RendererForm props',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/data-views/RendererForm/RendererForm.props.ts.json`,
    symbols: ['RFormProps', 'RendererForm'],
    usage: '确认表单容器的数据源、contextDataMember/contextDataField 和 autoColumns 参数。',
  }),
  rendererDetail: pageDesignKnowledgeRef({
    refId: 'generated.rendererDetail',
    title: 'RendererDetail props',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/data-views/RendererDetail/RendererDetail.props.ts.json`,
    symbols: ['RDetailProps', 'RendererDetail'],
    usage: '确认详情容器的数据源、字段上下文和展示参数。',
  }),
  rendererList: pageDesignKnowledgeRef({
    refId: 'generated.rendererList',
    title: 'RendererList props',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/data-views/RendererList/RendererList.props.ts.json`,
    symbols: ['RListProps', 'RendererList'],
    usage: '确认列表容器的数据源、actions、分页和 item 配置。',
  }),
  rendererTree: pageDesignKnowledgeRef({
    refId: 'generated.rendererTree',
    title: 'RendererTree props',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/data-views/RendererTree/RendererTree.props.ts.json`,
    symbols: ['RTreeProps', 'RendererTree'],
    usage: '确认树容器的数据源、nodeKey、currentKey 和展开行为。',
  }),
  rendererButton: pageDesignKnowledgeRef({
    refId: 'generated.rendererButton',
    title: 'RendererButton props',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-component/src/components/containers/layout/RendererButton.props.ts.json`,
    symbols: ['RButtonProps', 'RendererButton'],
    usage: '确认按钮动作、dataViewKey、appendPayload、inheritFields 和 patch 参数。',
  }),
  scriptTypes: pageDesignKnowledgeRef({
    refId: 'generated.scriptTypes',
    title: 'Script runtime types',
    source: 'generated-dts-class-model',
    path: `${PAGE_DESIGN_DTS_FILE_ROOT}/packages/spark-utils/src/script-types.ts.json`,
    symbols: ['FieldRenderConfig', 'ComponentInstanceSnapshot', 'ContextItem', 'ContextSnapshot'],
    usage: '确认脚本可用的字段渲染、组件快照和上下文数据结构。',
  }),
} as const

function pageDesignMetric(
  metricId: string,
  title: string,
  operator: AgentWorkflowProcessStageMetricOperator,
  target: number,
  unit: string,
): AgentWorkflowProcessStageMetric {
  return { metricId, title, operator, target, unit }
}

function pageDesignConsideration(
  phaseId: AgentWorkflowProcessStageConsideration['phaseId'],
  title: string,
  checks: readonly string[],
  metrics: readonly AgentWorkflowProcessStageMetric[],
): AgentWorkflowProcessStageConsideration {
  return { phaseId, title, checks, metrics }
}

function pageDesignPrerequisite(
  prerequisiteId: string,
  title: string,
  source: string,
  metrics: readonly AgentWorkflowProcessStageMetric[],
): AgentWorkflowProcessStagePrerequisite {
  return { prerequisiteId, title, source, metrics }
}

function pageDesignModel(
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

function pageDesignParameterSource(
  parameterId: string,
  title: string,
  source: string,
  path: string,
  required = true,
): AgentWorkflowProcessStageParameterSource {
  return { parameterId, title, source, path, required }
}

function pageDesignLlmTask(
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

function pageDesignVerification(
  verificationId: string,
  title: string,
  method: string,
  metrics: readonly AgentWorkflowProcessStageMetric[],
): AgentWorkflowProcessStageVerification {
  return { verificationId, title, method, metrics }
}

function pageDesignCompletion(
  criteria: readonly string[],
  nextWhen: string,
  stopWhen: string,
): AgentWorkflowProcessStageCompletion {
  return { criteria, nextWhen, stopWhen }
}

const PAGE_DESIGN_STAGE_CONSIDERATIONS = {
  scopeInventory: [
    pageDesignConsideration('F0', '身份边界', ['pageDesign 工艺对象明确', 'workflow 当前只表达流程图和节点工艺说明'], [
      pageDesignMetric('pageIdResolvedCount', '已定位 pageId 数', 'gte', 1, 'page'),
      pageDesignMetric('executionImplementationDecisionCount', '执行实现决策数', 'eq', 0, 'decision'),
    ]),
    pageDesignConsideration('F1', '原料盘点', ['四文件 binding 可读', '现有表、视图、handler、class 先盘点'], [
      pageDesignMetric('fileBindingCount', '四文件 binding 数', 'gte', 4, 'file'),
      pageDesignMetric('unreadAssetCount', '未读取资产数', 'eq', 0, 'asset'),
    ]),
    pageDesignConsideration('F3', '工单契约', ['任务类型和风险级别明确', '边界问题先收敛'], [
      pageDesignMetric('unresolvedBoundaryQuestionCount', '未解决边界问题数', 'eq', 0, 'question'),
      pageDesignMetric('allowedOperationDecisionCount', '操作权限决策数', 'gte', 1, 'decision'),
    ]),
    pageDesignConsideration('F6', '入口验收', ['bootstrap 进入 editing phase', '读盘点结果可被后续步骤消费'], [
      pageDesignMetric('bootstrapMissingCapabilityCount', '缺失 capability 数', 'eq', 0, 'capability'),
      pageDesignMetric('inventorySummaryCount', '盘点摘要数', 'gte', 1, 'summary'),
    ]),
  ],
  dataModel: [
    pageDesignConsideration('F1', '数据原料', ['业务对象、字段、资源语义进入 pagedata 规划', '静态 rows 与 API 来源分离'], [
      pageDesignMetric('businessObjectCount', '业务对象数', 'gte', 1, 'object'),
      pageDesignMetric('fieldDefinitionCount', '字段定义数', 'gte', 1, 'field'),
    ]),
    pageDesignConsideration('F2', '数据知识', ['DataSet/DataTable/DataView 规则已应用', '不把 UI 状态写入 columns'], [
      pageDesignMetric('uiStateColumnCount', 'UI 状态字段数', 'eq', 0, 'column'),
      pageDesignMetric('tablePrimaryKeyCoveragePercent', '主键覆盖率', 'gte', 100, 'percent'),
    ]),
    pageDesignConsideration('F4', '数据工位', ['使用 DataSetCrudTool 做结构化修改', '避免直接拼 pagedata 大 JSON'], [
      pageDesignMetric('dataSetCrudMutationCount', 'DataSetCrudTool 修改次数', 'gte', 1, 'mutation'),
      pageDesignMetric('directPageDataOverwriteCount', '直接覆盖 pagedata 次数', 'eq', 0, 'write'),
    ]),
    pageDesignConsideration('F6', '模型验收', ['DataSet 可 canonical 序列化', 'columns/rows/API/crudConfig 闭合'], [
      pageDesignMetric('dataSetRoundTripErrorCount', 'DataSet round-trip 错误数', 'eq', 0, 'error'),
      pageDesignMetric('rowColumnMismatchCount', 'rows 与 columns 不匹配数', 'eq', 0, 'mismatch'),
    ]),
  ],
  tableRelations: [
    pageDesignConsideration('F3', '关系契约', ['每条关系说明 parent/child/table/field', '同表多关系用 relationName 消歧'], [
      pageDesignMetric('relationAmbiguityCount', '关系歧义数', 'eq', 0, 'relation'),
      pageDesignMetric('relationFieldMissingCount', '关系字段缺失数', 'eq', 0, 'field'),
    ]),
    pageDesignConsideration('F5', '关系治理', ['没有消费场景的关系先不建', '不把数据库外键概念写进页面关系'], [
      pageDesignMetric('relationWithoutConsumerCount', '无消费场景关系数', 'eq', 0, 'relation'),
      pageDesignMetric('databaseOnlyForeignKeyCount', '数据库外键式配置数', 'eq', 0, 'relation'),
    ]),
    pageDesignConsideration('F6', '关系验收', ['parentField/childField 存在', '多层主从链条可解释'], [
      pageDesignMetric('missingParentFieldCount', '缺失父字段数', 'eq', 0, 'field'),
      pageDesignMetric('missingChildFieldCount', '缺失子字段数', 'eq', 0, 'field'),
    ]),
  ],
  pageDataUse: [
    pageDesignConsideration('F3', '页面消费契约', ['每个区域映射到业务对象或明确为静态区', '每个数据消费点说明成员语义'], [
      pageDesignMetric('regionMappingCoveragePercent', '区域到数据对象映射覆盖率', 'gte', 100, 'percent'),
      pageDesignMetric('dataConsumerWithoutRegionCount', '无页面区域的数据消费点数', 'eq', 0, 'consumer'),
    ]),
    pageDesignConsideration('F5', '消费治理', ['不为装饰区创建 DataView', '不把 dataMember/dataField 拼进 dataViewKey'], [
      pageDesignMetric('decorativeDataViewCount', '装饰区 DataView 数', 'eq', 0, 'view'),
      pageDesignMetric('invalidDataViewKeyPartCount', '非法 DataViewKey 片段数', 'eq', 0, 'binding'),
    ]),
    pageDesignConsideration('F8', '工单推进', ['消费点必须服务当前页面任务', '按钮作用域区分行内、工具栏、页面级'], [
      pageDesignMetric('consumerTraceabilityPercent', '消费点可追溯率', 'gte', 100, 'percent'),
      pageDesignMetric('ambiguousActionScopeCount', '动作作用域不明数', 'eq', 0, 'action'),
    ]),
  ],
  viewsDependencies: [
    pageDesignConsideration('F4', '视图工位', ['按消费点创建或复用 DataView', '显式 viewDependencies 只表达 parentTable/childTable'], [
      pageDesignMetric('stateIsolationDecisionCoveragePercent', '视图状态隔离决策覆盖率', 'gte', 100, 'percent'),
      pageDesignMetric('freeformViewDependencyCount', '任意命名 view 连线数', 'eq', 0, 'dependency'),
    ]),
    pageDesignConsideration('F5', '视图治理', ['同表多 UI 不串分页、筛选、当前行和选择状态', '没有消费点不建 view'], [
      pageDesignMetric('viewWithoutConsumerCount', '无消费点 view 数', 'eq', 0, 'view'),
      pageDesignMetric('sharedStateConflictCount', '共享状态冲突数', 'eq', 0, 'conflict'),
    ]),
    pageDesignConsideration('F6', '依赖验收', ['依赖对应 tableRelations 存在', 'default view 可用且无循环'], [
      pageDesignMetric('missingRelationForDependencyCount', '依赖缺失关系数', 'eq', 0, 'dependency'),
      pageDesignMetric('circularDependencyCount', '循环依赖数', 'eq', 0, 'cycle'),
    ]),
  ],
  structureBehaviorStyle: [
    pageDesignConsideration('F2', '组件知识', ['新增或替换组件前查 payload 和 guide', '脚本 API 使用真实约束'], [
      pageDesignMetric('componentGuideCoveragePercent', '组件 guide 覆盖率', 'gte', 100, 'percent'),
      pageDesignMetric('forbiddenScriptApiCount', '禁用脚本 API 数', 'eq', 0, 'api'),
    ]),
    pageDesignConsideration('F4', '结构工位', ['rule 用 nodeTree 精细修改', 'script/style 用 textModel 全文写入'], [
      pageDesignMetric('nodeTreeMutationCount', 'nodeTree 修改次数', 'gte', 1, 'mutation'),
      pageDesignMetric('wrongToolMutationCount', '错误工位修改次数', 'eq', 0, 'mutation'),
    ]),
    pageDesignConsideration('F6', '四文件验收', ['rule/pagedata/script/style 引用闭合', 'handler、component id、class 不悬空'], [
      pageDesignMetric('danglingDataBindingCount', '悬空数据绑定数', 'eq', 0, 'binding'),
      pageDesignMetric('missingHandlerCount', '缺失 handler 数', 'eq', 0, 'handler'),
      pageDesignMetric('unusedClassCount', '未使用 class 数', 'eq', 0, 'class'),
    ]),
    pageDesignConsideration('F9', '交付约束', ['结构、行为、样式变更都落在四文件资产', '本轮只记录交付判定，不设计保存实现'], [
      pageDesignMetric('outOfArtifactWriteCount', '四文件外写入数', 'eq', 0, 'write'),
      pageDesignMetric('deliveryImplementationDecisionCount', '交付实现决策数', 'eq', 0, 'decision'),
    ]),
  ],
  verifyDeliver: [
    pageDesignConsideration('F6', '最终验收', ['四文件交叉校验通过', '预览错误回补完成'], [
      pageDesignMetric('crossFileIssueCount', '四文件交叉问题数', 'eq', 0, 'issue'),
      pageDesignMetric('previewErrorCount', '预览错误数', 'eq', 0, 'error'),
    ]),
    pageDesignConsideration('F7', '设计交接', ['只交接流程图、参数来源和验证结果', '不设计执行调度实现'], [
      pageDesignMetric('handoffArtifactCount', '交接资料数', 'gte', 1, 'artifact'),
      pageDesignMetric('executionImplementationStepCount', '执行实现步骤数', 'eq', 0, 'step'),
    ]),
    pageDesignConsideration('F9', '交付闭环', ['四文件交付清单完整', '保存/回滚实现不在本轮流程图定型范围'], [
      pageDesignMetric('deliveryArtifactCount', '交付资产数', 'gte', 4, 'file'),
      pageDesignMetric('openDeliveryDesignQuestionCount', '交付设计遗留问题数', 'eq', 0, 'question'),
    ]),
  ],
} as const satisfies Record<string, readonly AgentWorkflowProcessStageConsideration[]>

export const PAGE_DESIGN_AGENT_WORKFLOW_PROCESS: AgentWorkflowProcess = {
  processId: 'pageDesign.data-first-100-step-process',
  title: '页面设计七段式数据优先工艺',
  sourceRef: PAGE_DESIGN_PROCESS_SOURCE_REF,
  principle: '流程图只表达页面设计工艺步骤；100 步文档提供工艺主线，generated/dts-class-model 知识库提供模型、参数和验证依据；F0-F9 是每个步骤的工厂检查维度，不作为流程节点。',
  knowledgeSources: Object.values(PAGE_DESIGN_KNOWLEDGE_REFS),
  stages: [
    {
      stageId: 'PD1.scope-inventory',
      title: '接单与盘点',
      sourceSteps: '1-20',
      goal: '确认 live editing 入口、改动边界和当前四文件状态。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.generatedManifest,
        PAGE_DESIGN_KNOWLEDGE_REFS.projectModel,
        PAGE_DESIGN_KNOWLEDGE_REFS.configPageNode,
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDataDesigner,
        PAGE_DESIGN_KNOWLEDGE_REFS.ruleEditor,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.scopeInventory,
      prerequisites: [
        pageDesignPrerequisite('PD1.pre.pageId', '页面定位已输入', 'runInput.pageId', [
          pageDesignMetric('pageIdResolvedCount', '已定位 pageId 数', 'gte', 1, 'page'),
        ]),
        pageDesignPrerequisite('PD1.pre.liveBinding', 'live editing binding 可用', 'PageDesignEditHost.bootstrap', [
          pageDesignMetric('fileBindingCount', '四文件 binding 数', 'gte', 4, 'file'),
          pageDesignMetric('bootstrapMissingCapabilityCount', '缺失 capability 数', 'eq', 0, 'capability'),
        ]),
      ],
      model: pageDesignModel(
        'orchestration-planning',
        'llm.reasoning.default',
        '需要归纳用户意图、风险边界和四文件盘点摘要，优先使用推理模型。',
        ['llm.reasoning.fast'],
      ),
      parameterSources: [
        pageDesignParameterSource('pageId', '页面 ID', 'runInput', 'pageId'),
        pageDesignParameterSource('description', '用户原始需求', 'runInput', 'description'),
        pageDesignParameterSource('allowedOperations', '允许操作范围', 'runInput', 'allowedOperations', false),
        pageDesignParameterSource('fileBindings', '四文件 live binding', 'PageDesignEditHost', 'nodeTree,dataset,script,style'),
      ],
      llmTask: pageDesignLlmTask(
        '把用户请求转成可执行页面设计工单，并完成当前四文件盘点。',
        ['确认任务类型和改动边界', '列出 pagedata/rule/script/style 当前状态摘要', '识别必须先澄清的问题'],
        ['pageId', 'riskLevel', 'changeBoundary', 'inventorySummary'],
        ['直接修改四文件', '设计执行调度实现'],
      ),
      verification: [
        pageDesignVerification('PD1.verify.entry', '入口和盘点验收', '检查 bootstrap 结果、四文件摘要和边界问题数。', [
          pageDesignMetric('unresolvedBoundaryQuestionCount', '未解决边界问题数', 'eq', 0, 'question'),
          pageDesignMetric('inventorySummaryCount', '盘点摘要数', 'gte', 1, 'summary'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['pageId 已解析', '四文件 binding 齐全', '边界问题为 0', '盘点摘要可供后续步骤使用'],
        '入口验收指标全部达标后进入数据规划与最小表模型。',
        'pageId 缺失、live binding 缺失或用户边界未确认时停止并请求澄清。',
      ),
      steps: [
        {
          stepId: 'PD1.1',
          title: '入口定界',
          sourceSteps: '1-10',
          actions: ['识别任务类型', '定位 pageId', 'bootstrap live editing', '确认风险和改动边界'],
          outputs: ['pageId', 'editing phase', 'change boundary'],
          checks: ['nodeTree/dataset/script/style binding 齐全', '数据优先，不先铺表格 UI 细节'],
        },
        {
          stepId: 'PD1.2',
          title: '四文件盘点',
          sourceSteps: '11-20',
          actions: ['读取 pagedata 摘要', '读取 rule 绑定', '收集 handler/class', '读取 script/style'],
          outputs: ['DataTable/Relation/View 清单', '组件绑定清单', 'handler/class 清单'],
          checks: ['已有表、字段、viewId、handler 和 class 可见', '不在未知结构上直接生成'],
        },
      ],
    },
    {
      stageId: 'PD2.data-model',
      title: '数据规划与最小表模型',
      sourceSteps: '21-40',
      goal: '先立业务数据事实，再建立足够支撑关系和视图的最小 DataTable。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataSet,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataTable,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataView,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataSetCrudTool,
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDataDesigner,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.dataModel,
      prerequisites: [
        pageDesignPrerequisite('PD2.pre.inventory', '已有四文件盘点结果', 'PD1.inventorySummary', [
          pageDesignMetric('inventorySummaryCount', '盘点摘要数', 'gte', 1, 'summary'),
        ]),
        pageDesignPrerequisite('PD2.pre.dataNeed', '存在数据建模需求', 'runInput.description + inventorySummary', [
          pageDesignMetric('businessObjectCandidateCount', '业务对象候选数', 'gte', 1, 'object'),
        ]),
      ],
      model: pageDesignModel(
        'data-modeling',
        'llm.reasoning.default',
        '需要从业务需求抽取对象、字段、资源语义和最小表结构，使用推理模型保证结构一致性。',
        ['llm.reasoning.fast'],
      ),
      parameterSources: [
        pageDesignParameterSource('requirement', '用户需求与有效描述', 'runInput', 'description,effectiveDescription'),
        pageDesignParameterSource('currentPageData', '当前 pagedata.json', 'PageDesignEditHost.dataset', 'pagedata.json'),
        pageDesignParameterSource(
          'datasetGuides',
          'DataSet/DataTable/DataView 知识',
          'generated-dts-class-model',
          `${PAGE_DESIGN_KNOWLEDGE_REFS.dataSet.path},${PAGE_DESIGN_KNOWLEDGE_REFS.dataTable.path},${PAGE_DESIGN_KNOWLEDGE_REFS.dataView.path},${PAGE_DESIGN_KNOWLEDGE_REFS.dataSetCrudTool.path}`,
        ),
      ],
      llmTask: pageDesignLlmTask(
        '输出最小 DataTable 方案并通过结构化工具落到 pagedata.json。',
        ['识别主表、子表、字典/引用表', '规划字段、主键、类型、label 和资源语义', '只创建关系和视图需要的最小表模型'],
        ['businessObjects', 'tableRoles', 'fieldPlan', 'minimalDataTablePatch'],
        ['把 UI 临时状态写进 columns', '直接整文件覆盖 pagedata.json'],
      ),
      verification: [
        pageDesignVerification('PD2.verify.dataset', 'DataSet 模型验收', '执行 DataSet canonical 序列化和字段/rows/API 对齐检查。', [
          pageDesignMetric('businessObjectCount', '业务对象数', 'gte', 1, 'object'),
          pageDesignMetric('tablePrimaryKeyCoveragePercent', '主键覆盖率', 'gte', 100, 'percent'),
          pageDesignMetric('dataSetRoundTripErrorCount', 'DataSet round-trip 错误数', 'eq', 0, 'error'),
          pageDesignMetric('rowColumnMismatchCount', 'rows 与 columns 不匹配数', 'eq', 0, 'mismatch'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['至少 1 个业务对象已建模', '主键覆盖率 100%', 'DataSet round-trip 错误为 0', 'rows 与 columns 不匹配数为 0'],
        '数据模型验收通过后进入表关系建模。',
        '业务对象无法确定、字段主键不闭合或 DataSet 不能序列化时停止。',
      ),
      steps: [
        {
          stepId: 'PD2.1',
          title: '业务对象和字段规划',
          sourceSteps: '21-30',
          actions: ['识别业务对象', '区分主表/子表/引用表/字典表/树节点表', '规划字段、类型、label、校验和资源语义'],
          outputs: ['业务对象清单', '表角色清单', '字段清单', '资源语义'],
          checks: ['表名可用于 DataViewKey', '不把 UI 临时状态塞进 DataTable columns'],
        },
        {
          stepId: 'PD2.2',
          title: '最小 DataTable 落地',
          sourceSteps: '31-40',
          actions: ['创建或更新主表、子表、字典/引用表', '补静态 rows 或远端 API family', '设置 crudConfig', '执行 canonical 序列化'],
          outputs: ['最小 DataTable 模型', '基础 rows/API/crudConfig', '可序列化 pagedata.json'],
          checks: ['样例 rows 与 columns 对齐', '表名不破坏 DataViewKey', 'DataSet 可 round-trip'],
        },
      ],
    },
    {
      stageId: 'PD3.table-relations',
      title: '表关系建模',
      sourceSteps: '41-50',
      goal: '建立业务父子关系，并只保留有真实页面价值的关系。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataSet,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataTable,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataSetCrudTool,
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDataDesigner,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.tableRelations,
      prerequisites: [
        pageDesignPrerequisite('PD3.pre.tables', '最小表模型已存在', 'PD2.minimalDataTablePatch', [
          pageDesignMetric('businessObjectCount', '业务对象数', 'gte', 1, 'object'),
          pageDesignMetric('fieldDefinitionCount', '字段定义数', 'gte', 1, 'field'),
        ]),
      ],
      model: pageDesignModel(
        'relation-modeling',
        'llm.reasoning.default',
        '需要判断业务父子链条、字段闭合和关系消费价值，使用推理模型。',
      ),
      parameterSources: [
        pageDesignParameterSource('tables', '表与字段清单', 'pagedata.json', 'tables.*.columns'),
        pageDesignParameterSource('requirement', '业务关系描述', 'runInput', 'description,effectiveDescription'),
        pageDesignParameterSource('existingRelations', '已有 tableRelations', 'pagedata.json', 'tableRelations', false),
      ],
      llmTask: pageDesignLlmTask(
        '设计必要 tableRelations，并证明每条关系有业务解释和页面消费价值。',
        ['识别父表、子表、parentField、childField', '多关系场景补 relationName', '删除无消费场景的伪关系'],
        ['tableRelationsPatch', 'relationRationale', 'relationValidationReport'],
        ['把数据库外键概念直接照搬进页面配置', '为看起来完整而创建无消费者关系'],
      ),
      verification: [
        pageDesignVerification('PD3.verify.relations', '关系闭合验收', '校验 parentField/childField 存在、关系无歧义且有消费场景。', [
          pageDesignMetric('relationFieldMissingCount', '关系字段缺失数', 'eq', 0, 'field'),
          pageDesignMetric('relationAmbiguityCount', '关系歧义数', 'eq', 0, 'relation'),
          pageDesignMetric('relationWithoutConsumerCount', '无消费场景关系数', 'eq', 0, 'relation'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['关系字段缺失数为 0', '关系歧义数为 0', '无消费场景关系数为 0'],
        '关系验收通过后进入页面规划与数据消费。',
        '父子字段缺失、关系解释不成立或消费场景不明确时停止。',
      ),
      steps: [
        {
          stepId: 'PD3.1',
          title: '关系建模',
          sourceSteps: '41-43',
          actions: ['设计 tableRelations', '处理多层主从', '用字段和 relationName 消歧'],
          outputs: ['tableRelations'],
          checks: ['父子链条能从业务上解释'],
        },
        {
          stepId: 'PD3.2',
          title: '关系验收',
          sourceSteps: '44-50',
          actions: ['校验 parentField/childField', '判断级联策略', '暂缓 viewDependencies', '复核关系消费价值'],
          outputs: ['关系校验结果'],
          checks: ['没有消费场景的关系先不建', '不把数据库外键概念误写进页面数据配置'],
        },
      ],
    },
    {
      stageId: 'PD4.page-data-use',
      title: '页面规划与数据消费',
      sourceSteps: '51-70',
      goal: '从数据事实推导页面区域，再把每个区域声明为明确的数据消费点。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataView,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataViewKey,
        PAGE_DESIGN_KNOWLEDGE_REFS.viewDataSource,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererTable,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererForm,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererDetail,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererList,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererTree,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererButton,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.pageDataUse,
      prerequisites: [
        pageDesignPrerequisite('PD4.pre.dataFacts', '数据事实和关系已闭合', 'PD2 + PD3 outputs', [
          pageDesignMetric('businessObjectCount', '业务对象数', 'gte', 1, 'object'),
          pageDesignMetric('relationFieldMissingCount', '关系字段缺失数', 'eq', 0, 'field'),
        ]),
      ],
      model: pageDesignModel(
        'page-information-architecture',
        'llm.reasoning.default',
        '需要把数据事实转为区域、操作路径和 DataView 消费契约，使用推理模型。',
        ['llm.reasoning.fast'],
      ),
      parameterSources: [
        pageDesignParameterSource('dataFacts', '表、字段、关系事实', 'pagedata.json', 'tables,tableRelations'),
        pageDesignParameterSource('currentRule', '当前组件树', 'PageDesignEditHost.nodeTree', 'rule.json'),
        pageDesignParameterSource('requirement', '页面目标和用户路径', 'runInput', 'description,effectiveDescription'),
        pageDesignParameterSource(
          'dataConsumerGuides',
          'DataViewKey、数据容器和按钮参数知识',
          'generated-dts-class-model',
          `${PAGE_DESIGN_KNOWLEDGE_REFS.dataViewKey.path},${PAGE_DESIGN_KNOWLEDGE_REFS.viewDataSource.path},${PAGE_DESIGN_KNOWLEDGE_REFS.rendererButton.path}`,
        ),
      ],
      llmTask: pageDesignLlmTask(
        '规划页面区域和数据消费点，明确每个 UI 区域消费哪个 DataView 成员。',
        ['规划首屏、主工作区、辅助区和操作路径', '标注 rows/currentRow/selectedRows/aggregateResult 等消费成员', '规划 field、$[fieldName]、optionDataViewKey 和按钮作用域'],
        ['pageRegionPlan', 'dataConsumerPlan', 'fieldBindingPlan', 'actionScopePlan'],
        ['为装饰区创建 DataView', '把 dataMember/dataField 拼进 dataViewKey'],
      ),
      verification: [
        pageDesignVerification('PD4.verify.consumers', '页面消费验收', '检查区域映射覆盖、消费点追溯和非法 DataViewKey。', [
          pageDesignMetric('regionMappingCoveragePercent', '区域到数据对象映射覆盖率', 'gte', 100, 'percent'),
          pageDesignMetric('dataConsumerWithoutRegionCount', '无页面区域的数据消费点数', 'eq', 0, 'consumer'),
          pageDesignMetric('invalidDataViewKeyPartCount', '非法 DataViewKey 片段数', 'eq', 0, 'binding'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['区域映射覆盖率 100%', '无页面区域的数据消费点数为 0', '非法 DataViewKey 片段数为 0'],
        '页面数据消费验收通过后进入按需视图与依赖。',
        '存在未映射区域、悬空消费点或非法 DataViewKey 时停止。',
      ),
      steps: [
        {
          stepId: 'PD4.1',
          title: '页面区域规划',
          sourceSteps: '51-60',
          actions: ['规划信息架构、操作路径、首屏、主工作区和辅助区', '区分真实数据容器和静态展示区'],
          outputs: ['页面区域清单', '区域到数据对象映射草图'],
          checks: ['装饰区不创建无意义 DataView', '每个区域都能解释其业务目的'],
        },
        {
          stepId: 'PD4.2',
          title: '数据消费规划',
          sourceSteps: '61-70',
          actions: ['标注 rows/currentRow/selectedRows/aggregateResult/selectionAggregateResult', '规划 field、$[fieldName]、optionDataViewKey 和按钮作用域'],
          outputs: ['DataView 消费点清单', '字段消费规则', '按钮数据作用域'],
          checks: ['每个消费点都有真实页面区域', '不把字段名或成员名拼进 dataViewKey'],
        },
      ],
    },
    {
      stageId: 'PD5.views-dependencies',
      title: '按需视图与依赖',
      sourceSteps: '71-88',
      goal: '按视图状态隔离创建或复用 DataView，并只在必要时显式声明 viewDependencies。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataView,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataViewKey,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataSetCrudTool,
        PAGE_DESIGN_KNOWLEDGE_REFS.viewDataSource,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.viewsDependencies,
      prerequisites: [
        pageDesignPrerequisite('PD5.pre.consumers', '数据消费点已定义', 'PD4.dataConsumerPlan', [
          pageDesignMetric('dataConsumerWithoutRegionCount', '无页面区域的数据消费点数', 'eq', 0, 'consumer'),
          pageDesignMetric('consumerTraceabilityPercent', '消费点可追溯率', 'gte', 100, 'percent'),
        ]),
      ],
      model: pageDesignModel(
        'view-state-and-dependency-planning',
        'llm.reasoning.default',
        '需要判断视图状态隔离、默认联动和显式 viewDependencies，使用推理模型。',
      ),
      parameterSources: [
        pageDesignParameterSource('consumerPlan', 'DataView 消费点清单', 'PD4.output', 'dataConsumerPlan'),
        pageDesignParameterSource('tablesAndRelations', '表与关系', 'pagedata.json', 'tables,tableRelations'),
        pageDesignParameterSource('currentViews', '已有 DataView', 'pagedata.json', 'tables.*.views', false),
        pageDesignParameterSource(
          'viewDependencyGuides',
          'DataView 与 ViewDependency 参数知识',
          'generated-dts-class-model',
          `${PAGE_DESIGN_KNOWLEDGE_REFS.dataView.path},${PAGE_DESIGN_KNOWLEDGE_REFS.dataSetCrudTool.path}`,
        ),
      ],
      llmTask: pageDesignLlmTask(
        '按消费点创建或复用 DataView，并决定是否需要显式 viewDependencies。',
        ['判断每个消费点的 rows/currentRow/selection/requestState 是否独立', '命名主消费 view 和可复用 view', '只在覆盖默认策略时显式声明 viewDependencies'],
        ['dataViewPlan', 'viewDependencyDecision', 'pagedataViewPatch'],
        ['创建无消费点 view', '表达任意命名 view 自由连线'],
      ),
      verification: [
        pageDesignVerification('PD5.verify.views', '视图和依赖验收', '检查状态隔离决策、无消费者 view、依赖关系和循环依赖。', [
          pageDesignMetric('stateIsolationDecisionCoveragePercent', '视图状态隔离决策覆盖率', 'gte', 100, 'percent'),
          pageDesignMetric('viewWithoutConsumerCount', '无消费点 view 数', 'eq', 0, 'view'),
          pageDesignMetric('missingRelationForDependencyCount', '依赖缺失关系数', 'eq', 0, 'dependency'),
          pageDesignMetric('circularDependencyCount', '循环依赖数', 'eq', 0, 'cycle'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['视图状态隔离决策覆盖率 100%', '无消费点 view 数为 0', '依赖缺失关系数为 0', '循环依赖数为 0'],
        '视图与依赖验收通过后进入结构行为样式落地。',
        '状态隔离不明、无消费者 view 或依赖不闭合时停止。',
      ),
      steps: [
        {
          stepId: 'PD5.1',
          title: '按消费点建视图',
          sourceSteps: '71-80',
          actions: ['判断消费点是否需要独立 DataView', '命名主消费 view', '配置分页、选择器、筛选、树、排序、过滤、autoLoad 和首行策略'],
          outputs: ['DataView 命名和复用方案', 'DataView 行为配置'],
          checks: ['同表多 UI 不串分页、筛选、当前行和选择状态', '首屏行为与自动加载策略一致'],
        },
        {
          stepId: 'PD5.2',
          title: '视图依赖闭合',
          sourceSteps: '81-88',
          actions: ['判断是否需要显式 viewDependencies', '设置 parentTable/childTable/dependencyType/autoLoad', '校验关系、default view 和循环依赖', '再次序列化'],
          outputs: ['viewDependencies 决策', '依赖校验结果', 'canonical pagedata.json'],
          checks: ['省略表示从 tableRelations 自动推导，[] 表示明确禁用', 'ViewDependency 不表达任意命名 view 自由连线'],
        },
      ],
    },
    {
      stageId: 'PD6.structure-behavior-style',
      title: '结构行为样式落地',
      sourceSteps: '89-96',
      goal: '最后落 rule/script/style，保持组件、事件和样式引用闭合。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.configPageNode,
        PAGE_DESIGN_KNOWLEDGE_REFS.sparkNodeTree,
        PAGE_DESIGN_KNOWLEDGE_REFS.sparkNode,
        PAGE_DESIGN_KNOWLEDGE_REFS.ruleEditor,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererTable,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererForm,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererDetail,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererList,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererTree,
        PAGE_DESIGN_KNOWLEDGE_REFS.rendererButton,
        PAGE_DESIGN_KNOWLEDGE_REFS.scriptTypes,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.structureBehaviorStyle,
      prerequisites: [
        pageDesignPrerequisite('PD6.pre.viewPlan', '数据消费与视图方案已闭合', 'PD4 + PD5 outputs', [
          pageDesignMetric('invalidDataViewKeyPartCount', '非法 DataViewKey 片段数', 'eq', 0, 'binding'),
          pageDesignMetric('viewWithoutConsumerCount', '无消费点 view 数', 'eq', 0, 'view'),
        ]),
      ],
      model: pageDesignModel(
        'structured-ui-and-script-generation',
        'llm.code.default',
        '需要生成 rule 结构、script 函数和 style 文本，使用代码模型并依赖组件指南。',
        ['llm.reasoning.default'],
      ),
      parameterSources: [
        pageDesignParameterSource('viewPlan', 'DataView 与依赖方案', 'PD5.output', 'dataViewPlan,viewDependencyDecision'),
        pageDesignParameterSource(
          'componentPayloads',
          '组件 payload 与 guide',
          'generated-dts-class-model',
          [
            PAGE_DESIGN_KNOWLEDGE_REFS.rendererTable.path,
            PAGE_DESIGN_KNOWLEDGE_REFS.rendererForm.path,
            PAGE_DESIGN_KNOWLEDGE_REFS.rendererDetail.path,
            PAGE_DESIGN_KNOWLEDGE_REFS.rendererList.path,
            PAGE_DESIGN_KNOWLEDGE_REFS.rendererTree.path,
            PAGE_DESIGN_KNOWLEDGE_REFS.rendererButton.path,
          ].join(','),
        ),
        pageDesignParameterSource('currentRuleScriptStyle', '当前 rule/script/style', 'PageDesignEditHost', 'rule.json,script.js,style.css'),
      ],
      llmTask: pageDesignLlmTask(
        '把页面区域和数据消费方案落到 rule/script/style。',
        ['查询组件 payload 和 guide 后写节点树', '绑定 dataViewKey/dataMember/dataField/field', '补齐 handler、__init__ 和样式 class'],
        ['rulePatch', 'scriptText', 'styleText', 'bindingClosureReport'],
        ['使用禁用脚本 API', '绕过 nodeTree 进行结构修改', '写四文件之外的资产'],
      ),
      verification: [
        pageDesignVerification('PD6.verify.files', '结构行为样式验收', '检查组件指南覆盖、数据绑定、handler、class 和脚本 API。', [
          pageDesignMetric('componentGuideCoveragePercent', '组件 guide 覆盖率', 'gte', 100, 'percent'),
          pageDesignMetric('danglingDataBindingCount', '悬空数据绑定数', 'eq', 0, 'binding'),
          pageDesignMetric('missingHandlerCount', '缺失 handler 数', 'eq', 0, 'handler'),
          pageDesignMetric('forbiddenScriptApiCount', '禁用脚本 API 数', 'eq', 0, 'api'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['组件 guide 覆盖率 100%', '悬空数据绑定数为 0', '缺失 handler 数为 0', '禁用脚本 API 数为 0'],
        '结构行为样式验收通过后进入交叉校验与收尾。',
        '存在悬空引用、缺失 handler、禁用 API 或错误工位修改时停止。',
      ),
      steps: [
        {
          stepId: 'PD6.1',
          title: 'rule 结构落地',
          sourceSteps: '89-92',
          actions: ['查询组件 payload', 'guide 组件参数', '写入页面节点树', '设置稳定 component id'],
          outputs: ['rule.json 节点树'],
          checks: ['组件、dataViewKey、dataMember、dataField、field 对齐', '脚本访问的组件 id 稳定'],
        },
        {
          stepId: 'PD6.2',
          title: 'script/style 落地',
          sourceSteps: '93-96',
          actions: ['生成 handler 清单', '补 __init__ 和事件函数', '写 script.js', '从 rule 收集 class 并补 style.css'],
          outputs: ['script.js', 'style.css'],
          checks: ['script 只用 $dataSet.getView(table, view)', 'style class 都被 rule 使用'],
        },
      ],
    },
    {
      stageId: 'PD7.verify-deliver',
      title: '交叉校验与收尾',
      sourceSteps: '97-100',
      goal: '完成四文件交叉校验、预览回补和交付说明。',
      knowledgeRefs: [
        PAGE_DESIGN_KNOWLEDGE_REFS.pageDesign100,
        PAGE_DESIGN_KNOWLEDGE_REFS.configPageNode,
        PAGE_DESIGN_KNOWLEDGE_REFS.sparkPageRenderer,
        PAGE_DESIGN_KNOWLEDGE_REFS.viewDataSource,
        PAGE_DESIGN_KNOWLEDGE_REFS.dataViewKey,
        PAGE_DESIGN_KNOWLEDGE_REFS.scriptTypes,
      ],
      considerations: PAGE_DESIGN_STAGE_CONSIDERATIONS.verifyDeliver,
      prerequisites: [
        pageDesignPrerequisite('PD7.pre.filesClosed', '四文件引用已初步闭合', 'PD6.bindingClosureReport', [
          pageDesignMetric('danglingDataBindingCount', '悬空数据绑定数', 'eq', 0, 'binding'),
          pageDesignMetric('missingHandlerCount', '缺失 handler 数', 'eq', 0, 'handler'),
        ]),
      ],
      model: pageDesignModel(
        'verification-and-risk-summary',
        'llm.reasoning.default',
        '需要解释验证结果、归因预览错误并输出交付风险，使用推理模型。',
      ),
      parameterSources: [
        pageDesignParameterSource('crossFileReport', '四文件交叉校验报告', 'verification', 'crossFileReport'),
        pageDesignParameterSource('previewResult', '预览或渲染结果', 'DevPreviewTab', 'previewResult', false),
        pageDesignParameterSource('changedArtifacts', '变更资产清单', 'PageDesignEditHost', 'rule,pagedata,script,style'),
      ],
      llmTask: pageDesignLlmTask(
        '验证 LLM 产物是否正确，并在通过后形成交付摘要。',
        ['检查表/字段/view/关系/handler/class 全部闭合', '根据预览错误回补前序阶段', '输出修改摘要和剩余风险'],
        ['crossFileVerification', 'previewFixReport', 'deliverySummary', 'residualRisk'],
        ['在验证失败时宣布完成', '设计保存或回滚实现'],
      ),
      verification: [
        pageDesignVerification('PD7.verify.delivery', '最终交付验收', '四文件交叉校验和预览结果均达标才允许结束。', [
          pageDesignMetric('crossFileIssueCount', '四文件交叉问题数', 'eq', 0, 'issue'),
          pageDesignMetric('previewErrorCount', '预览错误数', 'eq', 0, 'error'),
          pageDesignMetric('deliveryArtifactCount', '交付资产数', 'gte', 4, 'file'),
          pageDesignMetric('executionImplementationStepCount', '执行实现步骤数', 'eq', 0, 'step'),
        ]),
      ],
      completion: pageDesignCompletion(
        ['四文件交叉问题数为 0', '预览错误数为 0', '交付资产数不少于 4', '执行实现步骤数为 0'],
        '最终验收通过后结束工艺流程图定型候选。',
        '任一最终验收指标未达标时回到对应前序阶段修正；执行实现留到流程图定型后再设计。',
      ),
      steps: [
        {
          stepId: 'PD7.1',
          title: '四文件闭合校验',
          sourceSteps: '97-98',
          actions: ['校验 dataViewKey、dataMember、dataField、field、relation、dependency', '校验 handler、component id、class'],
          outputs: ['交叉校验结果'],
          checks: ['表、字段、view、关系、handler、class 全部闭合'],
        },
        {
          stepId: 'PD7.2',
          title: '预览与总结',
          sourceSteps: '99-100',
          actions: ['触发预览或页面渲染', '回补解析/渲染/自动加载/主从联动错误', '总结修改和剩余风险'],
          outputs: ['预览修正结果', '修改摘要', '剩余风险'],
          checks: ['用户知道改了哪些文件、如何验证'],
        },
      ],
    },
  ],
}

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
    process: PAGE_DESIGN_AGENT_WORKFLOW_PROCESS,
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
          capability: {
            alias: PAGE_DESIGN_MODULE_ID,
            moduleId: PAGE_DESIGN_MODULE_ID,
            rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
          },
          display: {
            name: '页面设计工厂',
            description: '以数据规划优先工艺生产 SPARK View 页面四文件。',
          },
          boundary: {
            ownsMutation: ['ConfigPageNode.rule', 'ConfigPageNode.dataSet', 'ConfigPageNode.script', 'ConfigPageNode.style'],
            forbiddenScenes: ['direct-file-write', 'execution-implementation-inside-workflow-definition'],
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
          editorResolver: 'getPageDesignEditor',
          domainRoot: {
            className: 'ProjectModel',
            pageEntryAction: 'openPageDesign',
            pageModelClassName: 'ConfigPageNode',
          },
          artifacts: {
            editableFiles: ['rule.json', 'pagedata.json', 'script.js', 'style.css'],
            dataModel: ['DataSet', 'DataTable', 'DataView'],
          },
          appContext: {
            moduleInstanceId: 'pageId',
            editingMode: 'live-memory-model',
          },
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
          processRef: PAGE_DESIGN_PROCESS_SOURCE_REF,
          closure: {
            requiredKinds: ['ProjectModel', 'ConfigPageNode', 'DataSet', 'DataTable', 'DataView', 'SparkNodeTree'],
            requiredActions: ['openPageDesign', 'editDataSet', 'editNodeTree', 'setFileText'],
          },
          craftPrinciples: [
            'data-first',
            'minimal-DataTable-before-r-table',
            'DataView-as-ui-consumption-contract',
            'four-file-cross-check',
          ],
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
          input: {
            requiredFields: ['pageId', 'description', 'effectiveDescription'],
            optionalFields: ['projectId', 'planningTitle', 'planningPath', 'mode', 'allowedOperations'],
          },
          orchestration: {
            planningSource: 'readPlanningProjection.effectiveDescription',
            scopeKey: 'pageId',
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
          stationSpec: {
            role: 'runtime-consumer-spec',
            workflowResponsibility: 'declare-required-tools-only',
            runtimeResponsibility: 'Host/Registration/ToolLoop/model_script execute this craft outside definition',
          },
          toolset: {
            discoveryToolNames: [
              CLASS_MODEL_TOOL_NAMES.query,
              CLASS_MODEL_TOOL_NAMES.modelGuide,
              CLASS_MODEL_TOOL_NAMES.attributeGuide,
              CLASS_MODEL_TOOL_NAMES.actionGuide,
            ],
            executionToolNames: [CLASS_MODEL_TOOL_NAMES.script],
          },
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
          craftDiscipline: {
            dataFirst: true,
            forbidDirectDiskWrite: true,
            forbidDraftProjection: true,
            requireModelScriptForMutation: true,
            modelScriptEntry: 'this.openPageDesign(pageId)',
          },
          recovery: {
            planWithoutTool: 'force-tool-call',
            modelScriptFailure: 'read-recovery-hint-and-retry',
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
            requiredStageIds: PAGE_DESIGN_AGENT_WORKFLOW_PROCESS.stages.map(stage => stage.stageId),
            requiredClosures: [
              'pagedata-table-field-view-closure',
              'tableRelations-viewDependencies-closure',
              'rule-dataViewKey-field-closure',
              'rule-script-handler-closure',
              'rule-style-class-closure',
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
          registrationBindingKey: PAGE_DESIGN_REGISTRATION_BINDING_KEY,
          handoff: {
            target: 'runtime-binding',
            workflowDoesNotActivateHost: true,
            bindingRef: PAGE_DESIGN_REGISTRATION_BINDING_KEY,
          },
        },
      },
      workOrder: {
        phaseId: 'F8',
        phase: 'workOrder',
        sectionPath: 'factory.workOrder',
        publishPath: 'workflow.factory.workOrder',
        value: {
          hostRunAlias: PAGE_DESIGN_MODULE_ID,
          productionProcess: {
            processId: PAGE_DESIGN_AGENT_WORKFLOW_PROCESS.processId,
            stageIds: PAGE_DESIGN_AGENT_WORKFLOW_PROCESS.stages.map(stage => stage.stageId),
            mode: 'progressive-data-first-craft',
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
          owner: 'pageDesignHostRunProvider',
          deliveryRules: {
            fullPageDesignArtifacts: ['rule.json', 'pagedata.json', 'script.js', 'style.css'],
            pageDataDesignArtifacts: ['pagedata.json'],
            workflowDoesNotSaveArtifacts: true,
          },
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
