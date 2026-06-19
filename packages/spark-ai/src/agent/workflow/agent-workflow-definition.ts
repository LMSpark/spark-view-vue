/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-definition
 * 职责：定义可序列化 Agent Workflow Definition 契约，发布态只表达 workflow graph。
 * 边界：只描述 workflow 定义，不持有函数、class 实例、APP、注册对象、delivery port 或 UI 状态。
 * AI用途：需要判断 workflow definition 字段、节点、边、Tool Node 或 Chatflow Node 格式时，用本模块确认契约。
 */

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

export type AgentWorkflowNodePosition = Readonly<{
  x: number
  y: number
}>

export type AgentWorkflowStartNodeData = Readonly<{
  title?: string
  inputMapping?: AgentWorkflowJsonRecord
}>

export type AgentWorkflowEndNodeData = Readonly<{
  title?: string
  outputMapping?: AgentWorkflowJsonRecord
}>

export type AgentWorkflowToolNodeData = Readonly<{
  title?: string
  provider: string
  toolName: string
  toolParameters: AgentWorkflowJsonRecord
  outputMapping?: AgentWorkflowJsonRecord
}>

export type AgentWorkflowReference = Readonly<{
  workflowId: string
  version?: number
  definitionPath?: string
}>

export type AgentWorkflowChatflowNodeData = Readonly<{
  title?: string
  workflowRef: AgentWorkflowReference
  inputMapping: AgentWorkflowJsonRecord
  outputMapping: AgentWorkflowJsonRecord
}>

export type AgentWorkflowSubWorkflowNodeData = Readonly<{
  title?: string
  workflowRef: AgentWorkflowReference
  inputMapping: AgentWorkflowJsonRecord
  outputMapping: AgentWorkflowJsonRecord
}>

export type AgentWorkflowGenericNodeData = Readonly<{
  title?: string
  [key: string]: unknown
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

export type AgentWorkflowEndNode = AgentWorkflowGraphNodeBase<'end', AgentWorkflowEndNodeData>

export type AgentWorkflowToolNode = AgentWorkflowGraphNodeBase<'tool', AgentWorkflowToolNodeData>

export type AgentWorkflowChatflowNode = AgentWorkflowGraphNodeBase<'chatflow', AgentWorkflowChatflowNodeData>

export type AgentWorkflowSubWorkflowNode = AgentWorkflowGraphNodeBase<'workflow', AgentWorkflowSubWorkflowNodeData>

export type AgentWorkflowConditionNode = AgentWorkflowGraphNodeBase<'condition', AgentWorkflowGenericNodeData>

export type AgentWorkflowCodeNode = AgentWorkflowGraphNodeBase<'code', AgentWorkflowGenericNodeData>

export type AgentWorkflowLlmNode = AgentWorkflowGraphNodeBase<'llm', AgentWorkflowGenericNodeData>

export type AgentWorkflowAgentNode = AgentWorkflowGraphNodeBase<'agent', AgentWorkflowGenericNodeData>

export type AgentWorkflowGraphNode =
  | AgentWorkflowStartNode
  | AgentWorkflowEndNode
  | AgentWorkflowToolNode
  | AgentWorkflowChatflowNode
  | AgentWorkflowSubWorkflowNode
  | AgentWorkflowConditionNode
  | AgentWorkflowCodeNode
  | AgentWorkflowLlmNode
  | AgentWorkflowAgentNode

export type AgentWorkflowGraphNodeType = AgentWorkflowGraphNode['type']

export type AgentWorkflowGraphEdge = Readonly<{
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  data?: AgentWorkflowJsonRecord
}>

export type AgentWorkflowGraph = Readonly<{
  nodes: readonly AgentWorkflowGraphNode[]
  edges: readonly AgentWorkflowGraphEdge[]
}>

export type AgentWorkflowBody = Readonly<{
  variables: readonly AgentWorkflowVariable[]
  graph: AgentWorkflowGraph
}>

export type AgentWorkflowToolParameterSource = 'constructor' | 'function' | 'binding'

export type AgentWorkflowToolParameterDescriptor = Readonly<{
  name: string
  required: boolean
  source: AgentWorkflowToolParameterSource
}>

export type AgentWorkflowToolDescriptor = Readonly<{
  provider: string
  toolName: string
  parameters: readonly AgentWorkflowToolParameterDescriptor[]
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
  'tool',
  'chatflow',
  'workflow',
  'condition',
  'code',
  'llm',
  'agent',
  'end',
] satisfies readonly AgentWorkflowGraphNodeType[])
