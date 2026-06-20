/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-definition
 * 职责：定义可序列化 Agent Workflow Definition 契约，发布态表达 workflow graph 与运行时 binding 声明。
 * 边界：只描述 workflow 定义，不持有函数、class 实例、APP、注册对象、delivery port 或 UI 状态。
 * AI用途：需要判断 workflow definition 字段、业务节点、边投影或验证 action 格式时，用本模块确认契约。
 */

import type { AiJsonSchemaObject } from '../../json'

export type AgentWorkflowJsonRecord = Readonly<Record<string, unknown>>

export type AgentWorkflowDefinitionKind = 'agent.workflow'

export type AgentWorkflowDefinitionVersion = 1

export type AgentWorkflowDefinitionSchema = 'spark.agent.workflow.definition.v1'

export type AgentWorkflowDefinitionValidationSeverity = 'error' | 'warning'

export type AgentWorkflowDefinitionValidationStatus = 'valid' | 'warning' | 'invalid'

export type AgentWorkflowDefinitionValidationIssue = Readonly<{
  severity: AgentWorkflowDefinitionValidationSeverity
  code: string
  message: string
  nodeId?: string
  path?: string
}>

export type AgentWorkflowDefinitionValidation = Readonly<{
  status: AgentWorkflowDefinitionValidationStatus
  issues: readonly AgentWorkflowDefinitionValidationIssue[]
}>

export type AgentWorkflowDefinitionSource = Readonly<{
  designKind: 'agent.workflow.design'
  designId: string
  designVersion: number
}>

export type AgentWorkflowVariable = Readonly<{
  name: string
  title?: string
  required?: boolean
  schema?: AgentWorkflowJsonRecord
  defaultValue?: unknown
}>

export type AgentWorkflowCapability = Readonly<{
  id: string
  title: string
  scope: string
  description: string
  inputs?: AgentWorkflowJsonRecord
  outputs?: AgentWorkflowJsonRecord
  constraints?: readonly string[]
}>

export type AgentWorkflowNodePosition = Readonly<{
  x: number
  y: number
}>

export type AgentWorkflowStartNodeData = Readonly<{
  type?: 'start'
  title?: string
  inputs?: AgentWorkflowJsonRecord
  projection?: AgentWorkflowJsonRecord
  validation?: AgentWorkflowJsonRecord
  state?: AgentWorkflowJsonRecord
  capabilities?: readonly AgentWorkflowCapability[]
}>

export type AgentWorkflowOutputNodeData = Readonly<{
  type?: 'output'
  title?: string
  outputs: AgentWorkflowJsonRecord
  upstreamValidation?: AgentWorkflowJsonRecord
  validation?: AgentWorkflowJsonRecord
  state?: AgentWorkflowJsonRecord
  result?: AgentWorkflowJsonRecord
  capabilities?: readonly AgentWorkflowCapability[]
}>

export type AgentWorkflowModelContext = Readonly<{
  rootClassName: string
  className: string
  contextPath?: string
}>

export type AgentWorkflowLlmWork = Readonly<{
  task: AgentWorkflowJsonRecord
  knowledge: AgentWorkflowJsonRecord
  functionCalling: AgentWorkflowJsonRecord
  output: AgentWorkflowJsonRecord
}>

export type AgentWorkflowNodeValidationAction = Readonly<{
  className: string
  actionName: string
  inputProjection: AgentWorkflowJsonRecord
  expectedResult: AgentWorkflowJsonRecord
}>

export type AgentWorkflowNodeValidation = Readonly<{
  action: AgentWorkflowNodeValidationAction
  status?: string
  issues?: readonly AgentWorkflowJsonRecord[]
}>

export type AgentWorkflowNodeRuntimeRegistration = Readonly<{
  alias: string
  moduleId: string
  businessId: string
}>

export type AgentWorkflowNodeInputContract = Readonly<{
  identityField: string
  messageField: string
  paramsSchema: AiJsonSchemaObject
  readonlySteps?: readonly string[]
}>

export type AgentWorkflowNodeConditionalHint = Readonly<{
  when: AgentWorkflowJsonRecord
  template: string
}>

export type AgentWorkflowNodeSystemPrompt = Readonly<{
  template: string
  conditionalHints?: readonly AgentWorkflowNodeConditionalHint[]
}>

export type AgentWorkflowNodeKnowledge = Readonly<{
  rootClassName: string
  manifestUrlRef: string
}>

export type AgentWorkflowNodeToolLoopNudge = Readonly<{
  templates: Readonly<Record<string, string>>
  contextFields?: readonly string[]
}>

export type AgentWorkflowNodeGateRule = Readonly<{
  kind: string
  [key: string]: unknown
}>

export type AgentWorkflowNodeBeforeFunctionCall = Readonly<{
  gateRules: readonly AgentWorkflowNodeGateRule[]
}>

export type AgentWorkflowNodeResolveInstance = Readonly<{
  editorSource: string
  identityField: string
}>

export type AgentWorkflowNodeModuleClassRef = Readonly<{
  kind: string
}>

export type AgentWorkflowNodeRuntimeBinding = Readonly<{
  registration: AgentWorkflowNodeRuntimeRegistration
  inputContract: AgentWorkflowNodeInputContract
  systemPrompt: AgentWorkflowNodeSystemPrompt
  knowledge: AgentWorkflowNodeKnowledge
  resolveInstance: AgentWorkflowNodeResolveInstance
  moduleClassRef: AgentWorkflowNodeModuleClassRef
  toolLoopNudge?: AgentWorkflowNodeToolLoopNudge
  beforeFunctionCall?: AgentWorkflowNodeBeforeFunctionCall
  executionToolNames?: readonly string[]
  planWithoutToolMarkers?: readonly string[]
  agentCompleteMethodName?: string
}>

export type AgentWorkflowBusinessNodeData = Readonly<{
  type?: 'node'
  title?: string
  model: AgentWorkflowModelContext
  inputs: AgentWorkflowJsonRecord
  outputs: AgentWorkflowJsonRecord
  llm: AgentWorkflowLlmWork
  validation: AgentWorkflowNodeValidation
  runtimeBinding?: AgentWorkflowNodeRuntimeBinding
  state?: AgentWorkflowJsonRecord
  result?: AgentWorkflowJsonRecord
  capabilities?: readonly AgentWorkflowCapability[]
}>

export type AgentWorkflowGraphNodeBase<
  TType extends string,
  TData extends AgentWorkflowJsonRecord,
> = Readonly<{
  id: string
  type: TType
  data: TData
  position?: AgentWorkflowNodePosition
}>

export type AgentWorkflowStartNode = AgentWorkflowGraphNodeBase<'start', AgentWorkflowStartNodeData>

export type AgentWorkflowOutputNode = AgentWorkflowGraphNodeBase<'output', AgentWorkflowOutputNodeData>

export type AgentWorkflowBusinessNode = AgentWorkflowGraphNodeBase<'node', AgentWorkflowBusinessNodeData>

export type AgentWorkflowGraphNode =
  | AgentWorkflowStartNode
  | AgentWorkflowBusinessNode
  | AgentWorkflowOutputNode

export type AgentWorkflowGraphNodeType = AgentWorkflowGraphNode['type']

export type AgentWorkflowEdgeProjection = Readonly<{
  sourceRef: string
  targetRef: string
  transform?: AgentWorkflowJsonRecord
}>

export type AgentWorkflowEdgeBranch = Readonly<{
  condition?: string
  label?: string
  priority?: number
  default?: boolean
}>

export type AgentWorkflowEdgeValidation = Readonly<{
  status?: string
  issues?: readonly AgentWorkflowJsonRecord[]
}>

export type AgentWorkflowGraphEdgeData = Readonly<{
  projection?: AgentWorkflowEdgeProjection
  branch?: AgentWorkflowEdgeBranch
  validation?: AgentWorkflowEdgeValidation
  [key: string]: unknown
}>

export type AgentWorkflowGraphEdge = Readonly<{
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  data?: AgentWorkflowGraphEdgeData
}>

export type AgentWorkflowGraph = Readonly<{
  nodes: readonly AgentWorkflowGraphNode[]
  edges: readonly AgentWorkflowGraphEdge[]
}>

export type AgentWorkflowBody = Readonly<{
  variables: readonly AgentWorkflowVariable[]
  capabilities: readonly AgentWorkflowCapability[]
  graph: AgentWorkflowGraph
}>

export type AgentWorkflowDefinitionSparkMeta = Readonly<{
  schema: AgentWorkflowDefinitionSchema
  publishedAt: string
  validation: AgentWorkflowDefinitionValidation
}>

export type AgentWorkflowDefinition = Readonly<{
  kind: AgentWorkflowDefinitionKind
  version: AgentWorkflowDefinitionVersion
  workflowId: string
  source: AgentWorkflowDefinitionSource
  workflow: AgentWorkflowBody
  x_spark: AgentWorkflowDefinitionSparkMeta
}>

export const AGENT_WORKFLOW_DEFINITION_KIND: AgentWorkflowDefinitionKind = 'agent.workflow'

export const AGENT_WORKFLOW_DEFINITION_VERSION: AgentWorkflowDefinitionVersion = 1

export const AGENT_WORKFLOW_DEFINITION_SCHEMA: AgentWorkflowDefinitionSchema = 'spark.agent.workflow.definition.v1'

export const AGENT_WORKFLOW_GRAPH_NODE_TYPES = Object.freeze([
  'start',
  'node',
  'output',
] satisfies readonly AgentWorkflowGraphNodeType[])
