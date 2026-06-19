/**
 * @module app:services/workflow-designs
 * 职责：提供 workflow 设计稿的 JSON 文件读写与 Dify-like graph 节点解析能力。
 * 边界：只处理编辑态 workflow design，不执行 Agent workflow 运行时。
 * AI用途：排查 workflow design、ClassModel Tool Node 或 Chatflow Node 时，用本模块确认前端接线。
 */
import {
  assertAgentWorkflowDefinition,
  createAgentWorkflowDefinitionValidation,
} from '@spark-appworks/spark-ai/agent'
import type * as SparkAgent from '@spark-appworks/spark-ai/agent'
import { http } from './http'
import { getWorkflowDesignApi } from './api-paths'

export type JsonRecord = Record<string, unknown>

export type WorkflowDesignSummary = {
  workflowId: string
  filename: string
  timestamp: string
  title?: string
  version?: number
  status?: string
  error?: string
}

export type WorkflowDesignWriteResult = {
  ok: boolean
  workflowId: string
  filename: string
  timestamp: string
}

export type WorkflowDesignReadResult = {
  workflowId: string
  filename: string
  timestamp: string
  document?: WorkflowDesignDocument
  notModified?: boolean
}

export type WorkflowDefinitionReadResult = {
  workflowId: string
  filename: string
  timestamp: string
  definition?: SparkAgent.AgentWorkflowDefinition
  notModified?: boolean
}

export type WorkflowDesignDeleteResult = {
  ok: boolean
  workflowId: string
  deleted: string[]
}

export type WorkflowDesignDocument = {
  kind: 'agent.workflow.design'
  version: number
  id: string
  workflow: {
    id: string
    version: number
    variables?: WorkflowDesignVariable[]
    capabilities?: WorkflowDesignCapability[]
    graph: WorkflowDesignGraph
    [key: string]: unknown
  }
  x_spark: {
    schema?: string
    designer?: JsonRecord
    draft?: JsonRecord
    validation?: JsonRecord
    history?: JsonRecord
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type WorkflowDesignVariable = {
  name: string
  title?: string
  required?: boolean
  schema?: JsonRecord
  defaultValue?: unknown
  [key: string]: unknown
}

export type WorkflowDesignCapability = {
  id: string
  title: string
  scope: string
  description: string
  inputs?: JsonRecord
  outputs?: JsonRecord
  constraints?: string[]
  [key: string]: unknown
}

export type WorkflowDesignGraph = {
  id?: string
  nodes: WorkflowDesignGraphNode[]
  edges: WorkflowDesignGraphEdge[]
  viewport?: {
    x?: number
    y?: number
    zoom?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type WorkflowDesignGraphNode = {
  id: string
  type: string
  position?: {
    x?: number
    y?: number
    [key: string]: unknown
  }
  data?: WorkflowDesignNodeData
  [key: string]: unknown
}

export type WorkflowDesignGraphEdge = {
  id?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  data?: JsonRecord
  [key: string]: unknown
}

export type WorkflowDesignNodeData = {
  type?: string
  title?: string
  desc?: string
  provider?: string
  toolName?: string
  inputs?: JsonRecord
  workflowRef?: WorkflowDesignWorkflowReference
  outputs?: JsonRecord
  capabilities?: WorkflowDesignCapability[]
  model?: JsonRecord
  loop?: WorkflowDesignNestedGraphCarrier
  iteration?: WorkflowDesignNestedGraphCarrier
  x_spark?: WorkflowDesignSparkNodeMeta
  [key: string]: unknown
}

export type WorkflowDesignWorkflowReference = {
  workflowId: string
  version?: number
  definitionPath?: string
  [key: string]: unknown
}

export type WorkflowDesignNestedGraphCarrier = {
  mode?: string
  maxLoopCount?: number
  exitNodeId?: string
  subGraph?: WorkflowDesignGraph
  [key: string]: unknown
}

export type WorkflowDesignSparkNodeMeta = {
  nodeRole?: string
  [key: string]: unknown
}

export type WorkflowDesignNodeView = {
  key: string
  id: string
  title: string
  nodeType: string
  depth: number
  scopePath: string
  ancestry: string[]
  node: WorkflowDesignGraphNode
  graph: WorkflowDesignGraph
  isClassModelToolNode: boolean
  isChatflowNode: boolean
  isWorkflowNode: boolean
  isSingleModelEditTool: boolean
  isProcessStageNode: boolean
}

export type WorkflowDesignGraphView = {
  key: string
  id: string
  title: string
  depth: number
  scopePath: string
  graph: WorkflowDesignGraph
  carrier: 'root' | 'loop' | 'iteration'
  ownerNodeId?: string
  ownerNode?: WorkflowDesignGraphNode
}

export type WorkflowDesignEdgeView = {
  key: string
  id: string
  source: string
  target: string
  depth: number
  scopePath: string
  graph: WorkflowDesignGraph
  edge: WorkflowDesignGraphEdge
  sourceNode?: WorkflowDesignGraphNode
  targetNode?: WorkflowDesignGraphNode
}

export type WorkflowDesignNodeCreateKind =
  | 'class-model-tool'
  | 'chatflow'
  | 'workflow'
  | 'start'
  | 'output'
  | 'condition'
  | 'code'
  | 'llm'
  | 'agent'
  | 'custom'

export type WorkflowDesignNodeCreateInput = {
  nodeKind: WorkflowDesignNodeCreateKind
  id?: string
  title?: string
  desc?: string
  position?: {
    x?: number
    y?: number
  }
}

export type WorkflowDesignNodeRemoveResult = {
  removed: boolean
  removedEdges: WorkflowDesignGraphEdge[]
}

export type WorkflowDesignEdgePatch = {
  source?: string
  target?: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  relation?: string
}

export type CreateAgentWorkflowDefinitionFromDesignOptions = {
  publishedAt?: string
}

type CollectWorkflowDesignNodeCommand = Readonly<{
  graph: WorkflowDesignGraph
  scopePath: string
  depth: number
  ancestry: string[]
}>

type CollectWorkflowDesignNestedNodeCommand = Readonly<{
  node: WorkflowDesignGraphNode
  scopePath: string
  depth: number
  ancestry: string[]
}>

type CreateWorkflowDefinitionNodeCommand<
  TType extends SparkAgent.AgentWorkflowGraphNodeType,
  TData extends SparkAgent.AgentWorkflowJsonRecord,
> = Readonly<{
  id: string
  type: TType
  data: TData
  position: WorkflowDesignGraphNode['position']
}>

const PLACEHOLDER_CLASS_MODEL_TOOL_NAME = 'spark.placeholder.tool'

export async function listWorkflowDesigns(): Promise<WorkflowDesignSummary[]> {
  return http.get<WorkflowDesignSummary[]>(`${getWorkflowDesignApi()}/__list`)
}

export async function createWorkflowDesign(input: {
  workflowId: string
  title?: string
}): Promise<WorkflowDesignWriteResult> {
  return http.post<WorkflowDesignWriteResult>(`${getWorkflowDesignApi()}/__create`, input)
}

export async function readWorkflowDesign(
  workflowId: string,
  timestamp?: string,
): Promise<WorkflowDesignReadResult> {
  return http.get<WorkflowDesignReadResult>(
    designDocumentUrl(workflowId),
    timestamp !== undefined && timestamp.length > 0 ? { timestamp } : undefined,
  )
}

export async function saveWorkflowDesign(
  workflowId: string,
  document: WorkflowDesignDocument,
): Promise<WorkflowDesignWriteResult> {
  return http.put<WorkflowDesignWriteResult>(designDocumentUrl(workflowId), document)
}

export async function readWorkflowDefinition(
  workflowId: string,
  timestamp?: string,
): Promise<WorkflowDefinitionReadResult> {
  return http.get<WorkflowDefinitionReadResult>(
    workflowDefinitionDocumentUrl(workflowId),
    timestamp !== undefined && timestamp.length > 0 ? { timestamp } : undefined,
  )
}

export async function saveWorkflowDefinition(
  workflowId: string,
  definition: SparkAgent.AgentWorkflowDefinition,
): Promise<WorkflowDesignWriteResult> {
  try {
    return await http.put<WorkflowDesignWriteResult>(workflowDefinitionDocumentUrl(workflowId), definition)
  } catch (error: unknown) {
    if (!isWorkflowDefinitionNotFoundError(error)) throw error
    return publishWorkflowDefinition(workflowId, definition)
  }
}

export async function publishWorkflowDefinition(
  workflowId: string,
  definition: SparkAgent.AgentWorkflowDefinition,
): Promise<WorkflowDesignWriteResult> {
  return http.post<WorkflowDesignWriteResult>(workflowDefinitionPublishUrl(workflowId), definition)
}

export async function deleteWorkflowDesign(workflowId: string): Promise<WorkflowDesignDeleteResult> {
  return http.delete<WorkflowDesignDeleteResult>(`${getWorkflowDesignApi()}/${encodeURIComponent(workflowId)}`)
}

export function createAgentWorkflowDefinitionFromDesign(
  document: WorkflowDesignDocument,
  options: CreateAgentWorkflowDefinitionFromDesignOptions = {},
): SparkAgent.AgentWorkflowDefinition {
  const issues = collectDefinitionPublishIssues(document)
  const validation = createAgentWorkflowDefinitionValidation(issues)
  const workflowExtras = normalizeDefinitionWorkflowExtras(document.workflow)
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: document.workflow.id,
    source: {
      designKind: document.kind,
      designId: document.id,
      designVersion: document.version,
    },
    workflow: {
      ...workflowExtras,
      variables: normalizeDefinitionVariables(document.workflow.variables),
      capabilities: normalizeDefinitionCapabilities(document.workflow.capabilities),
      graph: {
        nodes: document.workflow.graph.nodes.map(toDefinitionNode),
        edges: document.workflow.graph.edges.map(toDefinitionEdge),
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: options.publishedAt ?? new Date().toISOString(),
      validation,
    },
  }
}

export function parseAgentWorkflowDefinitionJson(text: string): SparkAgent.AgentWorkflowDefinition {
  const parsed: unknown = JSON.parse(text)
  assertAgentWorkflowDefinition(parsed)
  return parsed
}

export function isWorkflowDefinitionNotFoundError(error: unknown): boolean {
  const status = readErrorStatus(error)
  if (status === 404) return true

  const message = error instanceof Error ? error.message : String(error)
  return message.includes('No static resource')
    && message.includes('workflow-designs')
    && message.includes('definition.json')
}

export function collectWorkflowDesignNodes(document: WorkflowDesignDocument): WorkflowDesignNodeView[] {
  return collectGraphNodes({
    graph: document.workflow.graph,
    scopePath: 'workflow.graph',
    depth: 0,
    ancestry: [],
  })
}

export function collectWorkflowDesignGraphs(document: WorkflowDesignDocument): WorkflowDesignGraphView[] {
  const root: WorkflowDesignGraphView = {
    key: 'workflow.graph',
    id: typeof document.workflow.graph.id === 'string' && document.workflow.graph.id.length > 0
      ? document.workflow.graph.id
      : `${document.workflow.id}.graph`,
    title: 'Main Graph',
    depth: 0,
    scopePath: 'workflow.graph',
    graph: document.workflow.graph,
    carrier: 'root',
  }
  return [root, ...collectNestedGraphViews(document.workflow.graph, 'workflow.graph', 0)]
}

export function collectWorkflowDesignEdges(document: WorkflowDesignDocument): WorkflowDesignEdgeView[] {
  return collectWorkflowDesignGraphs(document).flatMap(view => collectGraphEdges(view))
}

export function isSingleModelEditToolNode(_node: WorkflowDesignGraphNode): boolean {
  return false
}

export function isProcessStageNode(_node: WorkflowDesignGraphNode): boolean {
  return false
}

export function getSingleModelEditValue(node: WorkflowDesignGraphNode): unknown {
  return node.data?.inputs ?? {}
}

export function setSingleModelEditValue(node: WorkflowDesignGraphNode, value: unknown): void {
  const data = ensureNodeData(node)
  data.inputs = isJsonRecord(value) ? value : {}
}

export function ensureWorkflowDraft(document: WorkflowDesignDocument): JsonRecord {
  const spark = ensureDocumentSpark(document)
  return ensureRecord(spark, 'draft')
}

export function markWorkflowDesignDirty(document: WorkflowDesignDocument, dirtyPath: string): void {
  const draft = ensureWorkflowDraft(document)
  draft['status'] = 'dirty'
  const dirtyPaths = Array.isArray(draft['dirtyPaths']) ? dirtyPathsFromDraft(draft) : []
  if (!dirtyPaths.includes(dirtyPath)) {
    dirtyPaths.push(dirtyPath)
  }
  draft['dirtyPaths'] = dirtyPaths
}

export function markWorkflowDesignSaved(document: WorkflowDesignDocument): void {
  const draft = ensureWorkflowDraft(document)
  draft['status'] = 'saved'
  draft['dirtyPaths'] = []
}

export function addWorkflowDesignEdge(
  graph: WorkflowDesignGraph,
  source: string,
  target: string,
): WorkflowDesignGraphEdge {
  const existing = graph.edges.find(edge => edge.source === source && edge.target === target)
  if (existing !== undefined) return existing

  const edge: WorkflowDesignGraphEdge = {
    id: nextEdgeId(graph, source, target),
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    type: 'custom',
    data: { relation: 'sequence' },
  }
  graph.edges.push(edge)
  return edge
}

export function createWorkflowDesignNode(
  graph: WorkflowDesignGraph,
  input: WorkflowDesignNodeCreateInput,
): WorkflowDesignGraphNode {
  const nodeId = nextNodeId(graph, input.id ?? defaultNodeId(input.nodeKind))
  const position = normalizePosition(input.position, graph.nodes.length)
  const node: WorkflowDesignGraphNode = {
    id: nodeId,
    type: resolveCreatedGraphNodeType(input.nodeKind),
    position,
    data: createNodeData(nodeId, input),
  }
  graph.nodes.push(node)
  return node
}

export function removeWorkflowDesignNode(
  graph: WorkflowDesignGraph,
  nodeId: string,
): WorkflowDesignNodeRemoveResult {
  const index = graph.nodes.findIndex(node => node.id === nodeId)
  if (index < 0) return { removed: false, removedEdges: [] }

  graph.nodes.splice(index, 1)
  const removedEdges: WorkflowDesignGraphEdge[] = []
  graph.edges = graph.edges.filter((edge) => {
    if (edge.source === nodeId || edge.target === nodeId) {
      removedEdges.push(edge)
      return false
    }
    return true
  })
  return { removed: true, removedEdges }
}

export function removeWorkflowDesignEdge(graph: WorkflowDesignGraph, edge: WorkflowDesignGraphEdge): boolean {
  const index = graph.edges.indexOf(edge)
  if (index < 0) return false
  graph.edges.splice(index, 1)
  return true
}

export function updateWorkflowDesignEdge(edge: WorkflowDesignGraphEdge, patch: WorkflowDesignEdgePatch): void {
  if (patch.source !== undefined) edge.source = patch.source
  if (patch.target !== undefined) edge.target = patch.target
  if (patch.sourceHandle !== undefined) edge.sourceHandle = patch.sourceHandle
  if (patch.targetHandle !== undefined) edge.targetHandle = patch.targetHandle
  if (patch.type !== undefined) edge.type = patch.type
  if (patch.relation !== undefined) {
    edge.data ??= {}
    edge.data['relation'] = patch.relation
  }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

function designDocumentUrl(workflowId: string): string {
  return `${getWorkflowDesignApi()}/${encodeURIComponent(workflowId)}/design.json`
}

function workflowDefinitionPublishUrl(workflowId: string): string {
  return `${getWorkflowDesignApi()}/${encodeURIComponent(workflowId)}/__publish`
}

function workflowDefinitionDocumentUrl(workflowId: string): string {
  return `${getWorkflowDesignApi()}/${encodeURIComponent(workflowId)}/definition.json`
}

function collectDefinitionPublishIssues(document: WorkflowDesignDocument): SparkAgent.AgentWorkflowDefinitionValidationIssue[] {
  const issues: SparkAgent.AgentWorkflowDefinitionValidationIssue[] = []
  const record: JsonRecord = document
  for (const field of ['app', 'factory', 'process'] as const) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_DESIGN_FIELD',
        message: `design.${field} is not allowed in workflow design.`,
        path: `design.${field}`,
      })
    }
  }
  for (const view of collectWorkflowDesignNodes(document)) {
    const data = view.node.data
    if (data === undefined) continue
    if (Object.prototype.hasOwnProperty.call(data, 'tool_name') || data['toolName'] === 'single_model_edit') {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE',
        message: `Legacy single_model_edit node "${view.id}" is not allowed.`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.data`,
      })
    }
    for (const field of ['toolParameters', 'inputMapping', 'outputMapping'] as const) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        issues.push({
          severity: 'error',
          code: 'AGENT_WORKFLOW_LEGACY_NODE_FIELD',
          message: `Legacy node field "${field}" is not allowed on "${view.id}".`,
          nodeId: view.id,
          path: `${view.scopePath}.${view.id}.data.${field}`,
        })
      }
    }
    if (isJsonRecord(data.x_spark) && Object.prototype.hasOwnProperty.call(data.x_spark, 'classModel')) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_CLASS_MODEL_META',
        message: `Legacy ClassModel node metadata is not allowed on "${view.id}".`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.data.x_spark.classModel`,
      })
    }
    if (data.type === 'process-step' || data.x_spark?.nodeRole === 'process-stage') {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE',
        message: `Legacy process-stage node "${view.id}" is not allowed.`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.data`,
      })
    }
  }
  return issues
}

function normalizeDefinitionWorkflowExtras(workflow: WorkflowDesignDocument['workflow']): JsonRecord {
  const extras: JsonRecord = {}
  for (const [key, value] of Object.entries(workflow)) {
    if (key === 'id' || key === 'version' || key === 'variables' || key === 'capabilities' || key === 'graph') continue
    extras[key] = value
  }
  return extras
}

function normalizeDefinitionVariables(value: WorkflowDesignVariable[] | undefined): readonly SparkAgent.AgentWorkflowVariable[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(variable => typeof variable.name === 'string' && variable.name.trim().length > 0)
    .map((variable): SparkAgent.AgentWorkflowVariable => ({
      name: variable.name.trim(),
      ...(typeof variable.title === 'string' && variable.title.trim().length > 0
        ? { title: variable.title.trim() }
        : {}),
      ...(typeof variable.required === 'boolean' ? { required: variable.required } : {}),
      ...(isJsonRecord(variable.schema) ? { schema: variable.schema } : {}),
      ...(Object.prototype.hasOwnProperty.call(variable, 'defaultValue') ? { defaultValue: variable.defaultValue } : {}),
    }))
}

function normalizeDefinitionCapabilities(value: WorkflowDesignCapability[] | undefined): readonly SparkAgent.AgentWorkflowCapability[] {
  return normalizeCapabilities(value, 'workflow')
}

function toDefinitionNode(node: WorkflowDesignGraphNode): SparkAgent.AgentWorkflowGraphNode {
  const type = resolveDefinitionNodeType(node)
  if (type === 'start') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  if (type === 'tool') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  if (type === 'chatflow') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  if (type === 'workflow') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  if (type === 'output') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  return createWorkflowDefinitionNode({
    id: node.id,
    type,
    data: normalizeNodeDataForDefinition(type, node.data),
    position: node.position,
  })
}

function toDefinitionEdge(edge: WorkflowDesignGraphEdge): SparkAgent.AgentWorkflowGraphEdge {
  return {
    id: edge.id ?? `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle === undefined ? {} : { sourceHandle: edge.sourceHandle }),
    ...(edge.targetHandle === undefined ? {} : { targetHandle: edge.targetHandle }),
    ...(edge.data === undefined ? {} : { data: edge.data }),
  }
}

function normalizeDefinitionNodePosition(
  position: WorkflowDesignGraphNode['position'],
): SparkAgent.AgentWorkflowNodePosition | undefined {
  const x = position?.x
  const y = position?.y
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  return { x, y }
}

function createWorkflowDefinitionNode<
  TType extends SparkAgent.AgentWorkflowGraphNodeType,
  TData extends SparkAgent.AgentWorkflowJsonRecord,
>(
  command: CreateWorkflowDefinitionNodeCommand<TType, TData>,
): SparkAgent.AgentWorkflowGraphNodeBase<TType, TData> {
  const position = normalizeDefinitionNodePosition(command.position)
  if (position === undefined) {
    return {
      id: command.id,
      type: command.type,
      data: command.data,
    }
  }
  return {
    id: command.id,
    type: command.type,
    data: command.data,
    position,
  }
}

function normalizeNodeDataForDefinition(
  type: 'start',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowStartNodeData
function normalizeNodeDataForDefinition(
  type: 'tool',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowToolNodeData
function normalizeNodeDataForDefinition(
  type: 'chatflow',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowChatflowNodeData
function normalizeNodeDataForDefinition(
  type: 'workflow',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowSubWorkflowNodeData
function normalizeNodeDataForDefinition(
  type: 'output',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowOutputNodeData
function normalizeNodeDataForDefinition(
  type: 'condition' | 'code' | 'llm' | 'agent',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowGenericNodeData
function normalizeNodeDataForDefinition(
  type: SparkAgent.AgentWorkflowGraphNodeType,
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowGraphNode['data'] {
  const data = value === undefined ? {} : { ...value }
  delete data.loop
  delete data.iteration
  delete data['toolParameters']
  delete data['inputMapping']
  delete data['outputMapping']
  delete data.x_spark
  const title = readTitle(data, defaultNodeTitleForType(type))
  const optionalCapabilities = normalizeOptionalCapabilities(data['capabilities'], 'node')
  if (type === 'start') {
    return {
      title,
      ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
    }
  }
  if (type === 'tool') {
    return {
      title,
      provider: readNonBlankText(data['provider']) ?? 'class-model',
      toolName: readNonBlankText(data['toolName']) ?? PLACEHOLDER_CLASS_MODEL_TOOL_NAME,
      inputs: isJsonRecord(data['inputs']) ? data['inputs'] : {},
      outputs: isJsonRecord(data['outputs']) ? data['outputs'] : {},
      capabilities: normalizeCapabilities(data['capabilities'], 'node'),
    }
  }
  if (type === 'chatflow' || type === 'workflow') {
    return {
      title,
      workflowRef: normalizeDefinitionWorkflowReference(data['workflowRef']),
      inputs: isJsonRecord(data['inputs']) ? data['inputs'] : {},
      outputs: isJsonRecord(data['outputs']) ? data['outputs'] : {},
      ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
    }
  }
  if (type === 'output') {
    return {
      title,
      outputs: isJsonRecord(data['outputs']) ? data['outputs'] : {},
      ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
    }
  }
  return {
    ...data,
    type,
    title,
    ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
  }
}

function normalizeDefinitionWorkflowReference(value: unknown): SparkAgent.AgentWorkflowReference {
  if (!isWorkflowReference(value)) return { workflowId: '', version: 1 }
  const definitionPath = readNonBlankText(value.definitionPath)
  return {
    workflowId: value.workflowId.trim(),
    ...(typeof value.version === 'number' ? { version: value.version } : {}),
    ...(definitionPath === undefined ? {} : { definitionPath }),
  }
}

function resolveDefinitionNodeType(node: WorkflowDesignGraphNode): SparkAgent.AgentWorkflowGraphNodeType {
  const dataType = node.data?.type
  if (isDefinitionNodeType(dataType)) return dataType
  if (isDefinitionNodeType(node.type)) return node.type
  return 'tool'
}

function resolveCreatedGraphNodeType(kind: WorkflowDesignNodeCreateKind): string {
  return kind === 'class-model-tool' ? 'tool' : kind
}

function createNodeData(nodeId: string, input: WorkflowDesignNodeCreateInput): WorkflowDesignNodeData {
  const normalizedTitle = input.title?.trim()
  const title = normalizedTitle === undefined || normalizedTitle.length === 0
    ? defaultNodeTitle(input.nodeKind)
    : normalizedTitle
  const desc = input.desc?.trim()
  if (input.nodeKind === 'class-model-tool') {
    return {
      type: 'tool',
      title,
      ...(desc === undefined || desc.length === 0 ? {} : { desc }),
      provider: 'class-model',
      toolName: PLACEHOLDER_CLASS_MODEL_TOOL_NAME,
      inputs: {},
      outputs: {},
      capabilities: [],
    }
  }
  if (input.nodeKind === 'chatflow' || input.nodeKind === 'workflow') {
    return {
      type: input.nodeKind,
      title,
      ...(desc === undefined || desc.length === 0 ? {} : { desc }),
      workflowRef: {
        workflowId: `${input.nodeKind}.${nodeId}`,
        version: 1,
        definitionPath: '',
      },
      inputs: {},
      outputs: {},
      capabilities: [],
    }
  }
  if (input.nodeKind === 'output') {
    return {
      type: 'output',
      title,
      ...(desc === undefined || desc.length === 0 ? {} : { desc }),
      outputs: {},
      capabilities: [],
    }
  }
  return {
    type: input.nodeKind,
    title,
    ...(desc === undefined || desc.length === 0 ? {} : { desc }),
  }
}

function collectGraphNodes(command: CollectWorkflowDesignNodeCommand): WorkflowDesignNodeView[] {
  const { graph, scopePath, depth, ancestry } = command
  const result: WorkflowDesignNodeView[] = []
  for (const node of graph.nodes) {
    const nodeType = typeof node.data?.type === 'string' ? node.data.type : node.type
    const title = typeof node.data?.title === 'string' && node.data.title.length > 0 ? node.data.title : node.id
    const isClassModelTool = isClassModelToolNode(node)
    const view: WorkflowDesignNodeView = {
      key: `${scopePath}:${node.id}`,
      id: node.id,
      title,
      nodeType,
      depth,
      scopePath,
      ancestry,
      node,
      graph,
      isClassModelToolNode: isClassModelTool,
      isChatflowNode: nodeType === 'chatflow',
      isWorkflowNode: nodeType === 'workflow',
      isSingleModelEditTool: false,
      isProcessStageNode: false,
    }
    result.push(view)
    result.push(...collectNestedNodes({ node, scopePath, depth, ancestry }))
  }
  return result
}

function collectNestedNodes(command: CollectWorkflowDesignNestedNodeCommand): WorkflowDesignNodeView[] {
  const { node, scopePath, depth, ancestry } = command
  const result: WorkflowDesignNodeView[] = []
  const nextAncestry = [...ancestry, node.id]
  const loopGraph = node.data?.loop?.subGraph
  if (loopGraph !== undefined) {
    result.push(...collectGraphNodes({
      graph: loopGraph,
      scopePath: `${scopePath}.${node.id}.loop.subGraph`,
      depth: depth + 1,
      ancestry: nextAncestry,
    }))
  }
  const iterationGraph = node.data?.iteration?.subGraph
  if (iterationGraph !== undefined) {
    result.push(...collectGraphNodes({
      graph: iterationGraph,
      scopePath: `${scopePath}.${node.id}.iteration.subGraph`,
      depth: depth + 1,
      ancestry: nextAncestry,
    }))
  }
  return result
}

function collectNestedGraphViews(
  graph: WorkflowDesignGraph,
  scopePath: string,
  depth: number,
): WorkflowDesignGraphView[] {
  const result: WorkflowDesignGraphView[] = []
  for (const node of graph.nodes) {
    const loopGraph = node.data?.loop?.subGraph
    if (loopGraph !== undefined) {
      const nextScopePath = `${scopePath}.${node.id}.loop.subGraph`
      result.push({
        key: nextScopePath,
        id: loopGraph.id ?? `${node.id}.loop`,
        title: `${node.id} / loop`,
        depth: depth + 1,
        scopePath: nextScopePath,
        graph: loopGraph,
        carrier: 'loop',
        ownerNodeId: node.id,
        ownerNode: node,
      })
      result.push(...collectNestedGraphViews(loopGraph, nextScopePath, depth + 1))
    }
    const iterationGraph = node.data?.iteration?.subGraph
    if (iterationGraph !== undefined) {
      const nextScopePath = `${scopePath}.${node.id}.iteration.subGraph`
      result.push({
        key: nextScopePath,
        id: iterationGraph.id ?? `${node.id}.iteration`,
        title: `${node.id} / iteration`,
        depth: depth + 1,
        scopePath: nextScopePath,
        graph: iterationGraph,
        carrier: 'iteration',
        ownerNodeId: node.id,
        ownerNode: node,
      })
      result.push(...collectNestedGraphViews(iterationGraph, nextScopePath, depth + 1))
    }
  }
  return result
}

function collectGraphEdges(view: WorkflowDesignGraphView): WorkflowDesignEdgeView[] {
  return view.graph.edges.map((edge, index) => {
    const sourceNode = view.graph.nodes.find(node => node.id === edge.source)
    const targetNode = view.graph.nodes.find(node => node.id === edge.target)
    return {
      key: `${view.scopePath}:edge:${edge.id ?? index}`,
      id: edge.id ?? `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      depth: view.depth,
      scopePath: view.scopePath,
      graph: view.graph,
      edge,
      ...(sourceNode === undefined ? {} : { sourceNode }),
      ...(targetNode === undefined ? {} : { targetNode }),
    }
  })
}

function isClassModelToolNode(node: WorkflowDesignGraphNode): boolean {
  const data = node.data
  return (data?.type === 'tool' || node.type === 'tool') && data?.provider === 'class-model'
}

function ensureDocumentSpark(document: WorkflowDesignDocument): JsonRecord {
  const spark = document.x_spark
  if (isJsonRecord(spark)) return spark
  document.x_spark = {}
  return document.x_spark
}

function ensureNodeData(node: WorkflowDesignGraphNode): WorkflowDesignNodeData {
  node.data ??= {}
  return node.data
}

function ensureRecord(parent: JsonRecord, key: string): JsonRecord {
  const existing = parent[key]
  if (isJsonRecord(existing)) return existing
  const created: JsonRecord = {}
  parent[key] = created
  return created
}

function dirtyPathsFromDraft(draft: JsonRecord): string[] {
  const value = draft['dirtyPaths']
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function nextNodeId(graph: WorkflowDesignGraph, baseId: string): string {
  const used = new Set(graph.nodes.map(node => node.id))
  if (!used.has(baseId)) return baseId
  let index = 2
  while (used.has(`${baseId}-${index}`)) {
    index += 1
  }
  return `${baseId}-${index}`
}

function nextEdgeId(graph: WorkflowDesignGraph, source: string, target: string): string {
  const baseId = `edge.${source}.${target}`.replace(/[^a-zA-Z0-9_.-]/gu, '-')
  const used = new Set(graph.edges.map(edge => edge.id).filter((id): id is string => typeof id === 'string'))
  if (!used.has(baseId)) return baseId
  let index = 2
  while (used.has(`${baseId}-${index}`)) {
    index += 1
  }
  return `${baseId}-${index}`
}

function defaultNodeId(kind: WorkflowDesignNodeCreateKind): string {
  switch (kind) {
    case 'class-model-tool':
      return 'tool.classModel'
    case 'chatflow':
      return 'chatflow.clarify'
    case 'workflow':
      return 'workflow.call'
    case 'start':
      return 'start'
    case 'output':
      return 'output'
    case 'condition':
      return 'condition'
    case 'code':
      return 'code'
    case 'llm':
      return 'llm'
    case 'agent':
      return 'agent'
    case 'custom':
      return 'node.custom'
  }
}

function defaultNodeTitle(kind: WorkflowDesignNodeCreateKind): string {
  switch (kind) {
    case 'class-model-tool':
      return 'ClassModel Tool'
    case 'chatflow':
      return 'Chatflow'
    case 'workflow':
      return 'Workflow'
    case 'start':
      return 'Start'
    case 'output':
      return 'Output'
    case 'condition':
      return 'Condition'
    case 'code':
      return 'Code'
    case 'llm':
      return 'LLM'
    case 'agent':
      return 'Agent'
    case 'custom':
      return 'Custom'
  }
}

function defaultNodeTitleForType(type: SparkAgent.AgentWorkflowGraphNodeType): string {
  if (type === 'tool') return 'ClassModel Tool'
  if (type === 'chatflow') return 'Chatflow'
  if (type === 'workflow') return 'Workflow'
  if (type === 'llm') return 'LLM'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function normalizePosition(
  input: WorkflowDesignNodeCreateInput['position'],
  index: number,
): NonNullable<WorkflowDesignGraphNode['position']> {
  return {
    x: typeof input?.x === 'number' ? input.x : 120 + index * 220,
    y: typeof input?.y === 'number' ? input.y : 120,
  }
}

function readErrorStatus(error: unknown): number | null {
  if (!isJsonRecord(error)) return null
  const status = error['status']
  if (typeof status === 'number') return status
  const response = error['response']
  if (!isJsonRecord(response)) return null
  const responseStatus = response['status']
  return typeof responseStatus === 'number' ? responseStatus : null
}

function readTitle(data: JsonRecord, fallback: string): string {
  const title = readNonBlankText(data['title'])
  return title ?? fallback
}

function normalizeOptionalCapabilities(value: unknown, fallbackScope: string): readonly SparkAgent.AgentWorkflowCapability[] | undefined {
  if (value === undefined) return undefined
  return normalizeCapabilities(value, fallbackScope)
}

function normalizeCapabilities(value: unknown, fallbackScope: string): readonly SparkAgent.AgentWorkflowCapability[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((capability): SparkAgent.AgentWorkflowCapability | null => {
      const id = readNonBlankText(capability['id'])
      const title = readNonBlankText(capability['title'])
      const description = readNonBlankText(capability['description'])
      if (id === undefined || title === undefined || description === undefined) return null
      const scope = readNonBlankText(capability['scope']) ?? fallbackScope
      return {
        id,
        title,
        scope,
        description,
        ...(isJsonRecord(capability['inputs']) ? { inputs: capability['inputs'] } : {}),
        ...(isJsonRecord(capability['outputs']) ? { outputs: capability['outputs'] } : {}),
        ...(Array.isArray(capability['constraints'])
          ? { constraints: capability['constraints'].filter((item): item is string => typeof item === 'string' && item.trim().length > 0) }
          : {}),
      }
    })
    .filter((capability): capability is SparkAgent.AgentWorkflowCapability => capability !== null)
}

function readNonBlankText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isDefinitionNodeType(value: unknown): value is SparkAgent.AgentWorkflowGraphNodeType {
  return value === 'start'
    || value === 'tool'
    || value === 'chatflow'
    || value === 'workflow'
    || value === 'condition'
    || value === 'code'
    || value === 'llm'
    || value === 'agent'
    || value === 'output'
}

function isWorkflowReference(value: unknown): value is WorkflowDesignWorkflowReference {
  return isJsonRecord(value) && typeof value['workflowId'] === 'string'
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
