/**
 * @module app:services/workflow-designs
 * 职责：提供工作流设计稿的 JSON 文件读写与 Dify-like graph 节点解析能力。
 * 边界：只处理编辑态 workflow design，不执行 Agent workflow 运行时。
 * AI用途：排查业务工厂 workflow 设计稿、loop 子图或 single_model_edit 工具节点时，用本模块确认前端接线。
 */
import {
  AGENT_WORKFLOW_FACTORY_PHASES,
  createAgentWorkflowDefinitionValidation,
  type AgentWorkflowDefinition,
  type AgentWorkflowDefinitionValidationIssue,
  type AgentWorkflowFactoryPhaseDescriptor,
  type AgentWorkflowFactorySection,
  type AgentWorkflowFactorySections,
} from '@spark-appworks/spark-ai/agent'
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

export type WorkflowDesignDeleteResult = {
  ok: boolean
  workflowId: string
  deleted: string[]
}

export type WorkflowDesignDocument = {
  kind: 'agent.workflow.design'
  version: number
  id: string
  app: {
    id: string
    name: string
    mode: string
    description?: string
    icon?: string
    icon_background?: string
    [key: string]: unknown
  }
  workflow: {
    id: string
    version: number
    graph: WorkflowDesignGraph
    [key: string]: unknown
  }
  x_spark: {
    schema?: string
    businessFactory?: boolean
    phaseModel?: string
    draft?: JsonRecord
    validation?: JsonRecord
    history?: JsonRecord
    [key: string]: unknown
  }
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
  provider_id?: string
  provider_type?: string
  tool_name?: string
  tool_label?: string
  tool_config?: JsonRecord
  tool_parameters?: JsonRecord
  outputs?: JsonRecord
  model?: JsonRecord
  loop?: WorkflowDesignNestedGraphCarrier
  iteration?: WorkflowDesignNestedGraphCarrier
  x_spark?: WorkflowDesignSparkNodeMeta
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
  phaseId?: string
  sectionPath?: string
  modelPath?: string
  publishPath?: string
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
  isSingleModelEditTool: boolean
  phaseId?: string
  sectionPath?: string
  publishPath?: string
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

export type WorkflowDesignNodeCreateKind = 'tool' | 'loop' | 'start' | 'end' | 'exit-loop' | 'custom'

export type WorkflowDesignNodeCreateInput = {
  nodeKind: WorkflowDesignNodeCreateKind
  id?: string
  title?: string
  desc?: string
  phaseId?: string
  sectionPath?: string
  publishPath?: string
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

const SINGLE_MODEL_EDIT_TOOL_NAME = 'single_model_edit'

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

export async function publishWorkflowDefinition(
  workflowId: string,
  definition: AgentWorkflowDefinition,
): Promise<WorkflowDesignWriteResult> {
  return http.post<WorkflowDesignWriteResult>(workflowDefinitionPublishUrl(workflowId), definition)
}

export async function deleteWorkflowDesign(workflowId: string): Promise<WorkflowDesignDeleteResult> {
  return http.delete<WorkflowDesignDeleteResult>(`${getWorkflowDesignApi()}/${encodeURIComponent(workflowId)}`)
}

export function createAgentWorkflowDefinitionFromDesign(
  document: WorkflowDesignDocument,
  options: CreateAgentWorkflowDefinitionFromDesignOptions = {},
): AgentWorkflowDefinition {
  const issues: AgentWorkflowDefinitionValidationIssue[] = []
  const sectionByPhase = new Map<AgentWorkflowFactoryPhaseDescriptor['phase'], AgentWorkflowFactorySection>()
  const publishPathByNode = new Map<string, WorkflowDesignNodeView>()
  const descriptorByPublishPath = new Map(
    AGENT_WORKFLOW_FACTORY_PHASES.map(descriptor => [descriptor.publishPath, descriptor] as const),
  )

  for (const node of collectWorkflowDesignNodes(document)) {
    if (!node.isSingleModelEditTool) continue
    const publishPath = node.publishPath?.trim()
    if (publishPath === undefined || publishPath.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'AGENT_WORKFLOW_TOOL_WITHOUT_PUBLISH_PATH',
        message: `single_model_edit node "${node.id}" has no publishPath and will not be published.`,
        nodeId: node.id,
        path: `${node.scopePath}.${node.id}.data.x_spark.publishPath`,
      })
      continue
    }

    const descriptor = descriptorByPublishPath.get(publishPath)
    if (descriptor === undefined) continue
    const duplicate = publishPathByNode.get(publishPath)
    if (duplicate !== undefined) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_DUPLICATE_PUBLISH_PATH',
        message: `publishPath "${publishPath}" is used by both "${duplicate.id}" and "${node.id}".`,
        phaseId: descriptor.phaseId,
        publishPath,
        nodeId: node.id,
        path: `${node.scopePath}.${node.id}`,
      })
      continue
    }
    publishPathByNode.set(publishPath, node)

    if (node.phaseId !== undefined && node.phaseId !== descriptor.phaseId) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_PHASE_ID_MISMATCH',
        message: `node "${node.id}" phaseId "${node.phaseId}" does not match ${descriptor.phaseId}.`,
        phaseId: descriptor.phaseId,
        publishPath,
        nodeId: node.id,
        path: `${node.scopePath}.${node.id}.data.x_spark.phaseId`,
      })
    }
    if (node.sectionPath !== undefined && node.sectionPath !== descriptor.sectionPath) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_SECTION_PATH_MISMATCH',
        message: `node "${node.id}" sectionPath "${node.sectionPath}" does not match ${descriptor.sectionPath}.`,
        phaseId: descriptor.phaseId,
        publishPath,
        nodeId: node.id,
        path: `${node.scopePath}.${node.id}.data.x_spark.sectionPath`,
      })
    }

    const value = readSingleModelEditObjectValue(node, descriptor, issues)
    if (Object.keys(value).length === 0) {
      issues.push({
        severity: 'warning',
        code: 'AGENT_WORKFLOW_EMPTY_SECTION_VALUE',
        message: `${descriptor.phaseId} ${descriptor.phase} section value is empty.`,
        phaseId: descriptor.phaseId,
        publishPath,
        nodeId: node.id,
        path: `${node.scopePath}.${node.id}.data.model.value`,
      })
    }
    sectionByPhase.set(descriptor.phase, {
      phaseId: descriptor.phaseId,
      phase: descriptor.phase,
      sectionPath: descriptor.sectionPath,
      publishPath: descriptor.publishPath,
      nodeId: node.id,
      scopePath: node.scopePath,
      value,
    })
  }

  for (const descriptor of AGENT_WORKFLOW_FACTORY_PHASES) {
    if (sectionByPhase.has(descriptor.phase)) continue
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_FACTORY_PHASE_MISSING',
      message: `${descriptor.phaseId} ${descriptor.phase} section is missing from workflow design.`,
      phaseId: descriptor.phaseId,
      publishPath: descriptor.publishPath,
      path: `workflow.factory.${descriptor.phase}`,
    })
    sectionByPhase.set(descriptor.phase, createEmptyAgentWorkflowSection(descriptor))
  }

  const validation = createAgentWorkflowDefinitionValidation(issues)
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: document.workflow.id,
    source: {
      designKind: document.kind,
      designId: document.id,
      designVersion: document.version,
    },
    factory: createAgentWorkflowFactorySections(sectionByPhase),
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: options.publishedAt ?? new Date().toISOString(),
      validation,
    },
  }
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

export function isSingleModelEditToolNode(node: WorkflowDesignGraphNode): boolean {
  const data = node.data
  return data?.type === 'tool' && data.tool_name === SINGLE_MODEL_EDIT_TOOL_NAME
}

export function getSingleModelEditValue(node: WorkflowDesignGraphNode): unknown {
  const model = node.data?.model
  return model !== undefined && Object.prototype.hasOwnProperty.call(model, 'value') ? model['value'] : {}
}

export function setSingleModelEditValue(node: WorkflowDesignGraphNode, value: unknown): void {
  const data = ensureNodeData(node)
  const model = ensureRecord(data, 'model')
  model['value'] = value
}

export function ensureWorkflowDraft(document: WorkflowDesignDocument): JsonRecord {
  const spark = ensureDocumentSpark(document)
  return ensureRecord(spark, 'draft')
}

export function markWorkflowDesignDirty(document: WorkflowDesignDocument, dirtyPath: string): void {
  const draft = ensureWorkflowDraft(document)
  draft['status'] = 'dirty'
  const dirtyPaths = Array.isArray(draft['dirtyPaths']) ? draft['dirtyPaths'] : []
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
  const nodeId = nextNodeId(graph, input.id ?? defaultNodeId(input.nodeKind, input.phaseId))
  const position = normalizePosition(input.position, graph.nodes.length)
  const node: WorkflowDesignGraphNode = {
    id: nodeId,
    type: 'custom',
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

function readSingleModelEditObjectValue(
  node: WorkflowDesignNodeView,
  descriptor: AgentWorkflowFactoryPhaseDescriptor,
  issues: AgentWorkflowDefinitionValidationIssue[],
): Readonly<Record<string, unknown>> {
  const value = getSingleModelEditValue(node.node)
  if (isJsonRecord(value)) return value
  issues.push({
    severity: 'error',
    code: 'AGENT_WORKFLOW_SECTION_VALUE_NOT_OBJECT',
    message: `${descriptor.phaseId} ${descriptor.phase} section value must be an object.`,
    phaseId: descriptor.phaseId,
    publishPath: descriptor.publishPath,
    nodeId: node.id,
    path: `${node.scopePath}.${node.id}.data.model.value`,
  })
  return {}
}

function createEmptyAgentWorkflowSection(
  descriptor: AgentWorkflowFactoryPhaseDescriptor,
): AgentWorkflowFactorySection {
  return {
    phaseId: descriptor.phaseId,
    phase: descriptor.phase,
    sectionPath: descriptor.sectionPath,
    publishPath: descriptor.publishPath,
    value: {},
  }
}

function createAgentWorkflowFactorySections(
  sectionByPhase: ReadonlyMap<AgentWorkflowFactoryPhaseDescriptor['phase'], AgentWorkflowFactorySection>,
): AgentWorkflowFactorySections {
  const identity = readPublishedSection(sectionByPhase, 'identity')
  const materials = readPublishedSection(sectionByPhase, 'materials')
  const knowledge = readPublishedSection(sectionByPhase, 'knowledge')
  const contract = readPublishedSection(sectionByPhase, 'contract')
  const runtime = readPublishedSection(sectionByPhase, 'runtime')
  const governance = readPublishedSection(sectionByPhase, 'governance')
  const acceptance = readPublishedSection(sectionByPhase, 'acceptance')
  const activation = readPublishedSection(sectionByPhase, 'activation')
  const workOrder = readPublishedSection(sectionByPhase, 'workOrder')
  const delivery = readPublishedSection(sectionByPhase, 'delivery')

  return {
    identity: {
      phaseId: 'F0',
      phase: 'identity',
      sectionPath: 'factory.identity',
      publishPath: 'workflow.factory.identity',
      ...readPublishedSectionSource(identity),
      value: identity.value,
    },
    materials: {
      phaseId: 'F1',
      phase: 'materials',
      sectionPath: 'factory.materials',
      publishPath: 'workflow.factory.materials',
      ...readPublishedSectionSource(materials),
      value: materials.value,
    },
    knowledge: {
      phaseId: 'F2',
      phase: 'knowledge',
      sectionPath: 'factory.knowledge',
      publishPath: 'workflow.factory.knowledge',
      ...readPublishedSectionSource(knowledge),
      value: knowledge.value,
    },
    contract: {
      phaseId: 'F3',
      phase: 'contract',
      sectionPath: 'factory.contract',
      publishPath: 'workflow.factory.contract',
      ...readPublishedSectionSource(contract),
      value: contract.value,
    },
    runtime: {
      phaseId: 'F4',
      phase: 'runtime',
      sectionPath: 'factory.runtime',
      publishPath: 'workflow.factory.runtime',
      ...readPublishedSectionSource(runtime),
      value: runtime.value,
    },
    governance: {
      phaseId: 'F5',
      phase: 'governance',
      sectionPath: 'factory.governance',
      publishPath: 'workflow.factory.governance',
      ...readPublishedSectionSource(governance),
      value: governance.value,
    },
    acceptance: {
      phaseId: 'F6',
      phase: 'acceptance',
      sectionPath: 'factory.acceptance',
      publishPath: 'workflow.factory.acceptance',
      ...readPublishedSectionSource(acceptance),
      value: acceptance.value,
    },
    activation: {
      phaseId: 'F7',
      phase: 'activation',
      sectionPath: 'factory.activation',
      publishPath: 'workflow.factory.activation',
      ...readPublishedSectionSource(activation),
      value: activation.value,
    },
    workOrder: {
      phaseId: 'F8',
      phase: 'workOrder',
      sectionPath: 'factory.workOrder',
      publishPath: 'workflow.factory.workOrder',
      ...readPublishedSectionSource(workOrder),
      value: workOrder.value,
    },
    delivery: {
      phaseId: 'F9',
      phase: 'delivery',
      sectionPath: 'factory.delivery',
      publishPath: 'workflow.factory.delivery',
      ...readPublishedSectionSource(delivery),
      value: delivery.value,
    },
  }
}

function readPublishedSection(
  sectionByPhase: ReadonlyMap<AgentWorkflowFactoryPhaseDescriptor['phase'], AgentWorkflowFactorySection>,
  phase: AgentWorkflowFactoryPhaseDescriptor['phase'],
): AgentWorkflowFactorySection {
  const section = sectionByPhase.get(phase)
  if (section === undefined) {
    throw new Error(`Missing agent workflow section after normalization: ${phase}`)
  }
  return section
}

function readPublishedSectionSource(
  section: AgentWorkflowFactorySection,
): Readonly<Pick<AgentWorkflowFactorySection, 'nodeId' | 'scopePath'>> {
  return {
    ...(section.nodeId === undefined ? {} : { nodeId: section.nodeId }),
    ...(section.scopePath === undefined ? {} : { scopePath: section.scopePath }),
  }
}

function collectGraphNodes(command: CollectWorkflowDesignNodeCommand): WorkflowDesignNodeView[] {
  const { graph, scopePath, depth, ancestry } = command
  const result: WorkflowDesignNodeView[] = []
  for (const node of graph.nodes) {
    const data = node.data
    const spark = data?.x_spark
    const nodeType = typeof data?.type === 'string' ? data.type : node.type
    const title = typeof data?.title === 'string' && data.title.length > 0 ? data.title : node.id
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
      isSingleModelEditTool: isSingleModelEditToolNode(node),
      ...(typeof spark?.phaseId === 'string' ? { phaseId: spark.phaseId } : {}),
      ...(typeof spark?.sectionPath === 'string' ? { sectionPath: spark.sectionPath } : {}),
      ...(typeof spark?.publishPath === 'string' ? { publishPath: spark.publishPath } : {}),
    }
    result.push(view)

    const childAncestry = [...ancestry, node.id]
    const loopSubGraph = data?.loop?.subGraph
    if (isWorkflowDesignGraph(loopSubGraph)) {
      result.push(...collectGraphNodes({
        graph: loopSubGraph,
        scopePath: `${scopePath}.${node.id}.loop.subGraph`,
        depth: depth + 1,
        ancestry: childAncestry,
      }))
    }
    const iterationSubGraph = data?.iteration?.subGraph
    if (isWorkflowDesignGraph(iterationSubGraph)) {
      result.push(...collectGraphNodes({
        graph: iterationSubGraph,
        scopePath: `${scopePath}.${node.id}.iteration.subGraph`,
        depth: depth + 1,
        ancestry: childAncestry,
      }))
    }
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
    const data = node.data
    const loopSubGraph = data?.loop?.subGraph
    if (isWorkflowDesignGraph(loopSubGraph)) {
      const childScopePath = `${scopePath}.${node.id}.loop.subGraph`
      result.push({
        key: childScopePath,
        id: typeof loopSubGraph.id === 'string' && loopSubGraph.id.length > 0 ? loopSubGraph.id : childScopePath,
        title: `${readNodeTitle(node)} Loop Subgraph`,
        depth: depth + 1,
        scopePath: childScopePath,
        graph: loopSubGraph,
        carrier: 'loop',
        ownerNodeId: node.id,
        ownerNode: node,
      })
      result.push(...collectNestedGraphViews(loopSubGraph, childScopePath, depth + 1))
    }

    const iterationSubGraph = data?.iteration?.subGraph
    if (isWorkflowDesignGraph(iterationSubGraph)) {
      const childScopePath = `${scopePath}.${node.id}.iteration.subGraph`
      result.push({
        key: childScopePath,
        id: typeof iterationSubGraph.id === 'string' && iterationSubGraph.id.length > 0
          ? iterationSubGraph.id
          : childScopePath,
        title: `${readNodeTitle(node)} Iteration Subgraph`,
        depth: depth + 1,
        scopePath: childScopePath,
        graph: iterationSubGraph,
        carrier: 'iteration',
        ownerNodeId: node.id,
        ownerNode: node,
      })
      result.push(...collectNestedGraphViews(iterationSubGraph, childScopePath, depth + 1))
    }
  }
  return result
}

function collectGraphEdges(view: WorkflowDesignGraphView): WorkflowDesignEdgeView[] {
  const nodeById = new Map(view.graph.nodes.map(node => [node.id, node] as const))
  return view.graph.edges.map((edge, index) => {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    return {
      key: `${view.scopePath}:${readEdgeId(edge, index)}`,
      id: readEdgeId(edge, index),
      source: edge.source,
      target: edge.target,
      depth: view.depth,
      scopePath: view.scopePath,
      graph: view.graph,
      edge,
      ...(sourceNode !== undefined ? { sourceNode } : {}),
      ...(targetNode !== undefined ? { targetNode } : {}),
    }
  })
}

function readNodeTitle(node: WorkflowDesignGraphNode): string {
  const title = node.data?.title
  return typeof title === 'string' && title.length > 0 ? title : node.id
}

function readEdgeId(edge: WorkflowDesignGraphEdge, index: number): string {
  return typeof edge.id === 'string' && edge.id.length > 0 ? edge.id : `edge.${edge.source}.${edge.target}.${index}`
}

function nextEdgeId(graph: WorkflowDesignGraph, source: string, target: string): string {
  const base = `edge.${source}.${target}`.replace(/[^\w.-]+/gu, '-')
  const used = new Set(graph.edges.map((edge, index) => readEdgeId(edge, index)))
  if (!used.has(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = `${base}.${index}`
    if (!used.has(candidate)) return candidate
  }
}

function nextNodeId(graph: WorkflowDesignGraph, preferredId: string): string {
  const base = sanitizeIdentifier(preferredId.trim().length > 0 ? preferredId : 'node.custom')
  const used = new Set(graph.nodes.map(node => node.id))
  if (!used.has(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = `${base}.${index}`
    if (!used.has(candidate)) return candidate
  }
}

function defaultNodeId(kind: WorkflowDesignNodeCreateKind, phaseId?: string): string {
  const normalizedPhaseId = phaseId?.trim()
  if (kind === 'tool') {
    return `phase.${sanitizeIdentifier(
      normalizedPhaseId !== undefined && normalizedPhaseId.length > 0 ? normalizedPhaseId : 'custom',
    )}`
  }
  if (kind === 'loop') return 'loop.group'
  if (kind === 'start') return 'start'
  if (kind === 'end') return 'end'
  if (kind === 'exit-loop') return 'loop.exit'
  return 'node.custom'
}

function sanitizeIdentifier(value: string): string {
  const normalized = value.trim().replace(/[^\w.-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return normalized.length > 0 ? normalized : 'node.custom'
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePosition(
  position: WorkflowDesignNodeCreateInput['position'],
  index: number,
): { x: number; y: number } {
  const fallbackX = 80 + (index % 4) * 240
  const fallbackY = 80 + Math.floor(index / 4) * 160
  return {
    x: typeof position?.x === 'number' && Number.isFinite(position.x) ? position.x : fallbackX,
    y: typeof position?.y === 'number' && Number.isFinite(position.y) ? position.y : fallbackY,
  }
}

function createNodeData(nodeId: string, input: WorkflowDesignNodeCreateInput): WorkflowDesignNodeData {
  const normalizedTitle = input.title?.trim()
  const title = normalizedTitle !== undefined && normalizedTitle.length > 0
    ? normalizedTitle
    : defaultNodeTitle(input.nodeKind, nodeId)
  const desc = input.desc?.trim() ?? ''
  if (input.nodeKind === 'tool') {
    const normalizedPhaseId = input.phaseId?.trim()
    const phaseId = normalizedPhaseId !== undefined && normalizedPhaseId.length > 0
      ? normalizedPhaseId
      : nodeId.replace(/^phase\./u, '')
    const normalizedSectionPath = input.sectionPath?.trim()
    const sectionPath = normalizedSectionPath !== undefined && normalizedSectionPath.length > 0
      ? normalizedSectionPath
      : `factory.${phaseId}`
    const normalizedPublishPath = input.publishPath?.trim()
    const publishPath = normalizedPublishPath !== undefined && normalizedPublishPath.length > 0
      ? normalizedPublishPath
      : `workflow.${sectionPath}`
    return {
      type: 'tool',
      title,
      desc,
      provider_id: 'spark.model-editor',
      provider_type: 'builtin',
      tool_name: SINGLE_MODEL_EDIT_TOOL_NAME,
      tool_label: 'Single Model Edit',
      tool_config: {},
      tool_parameters: {},
      outputs: {},
      model: {
        phaseId,
        sectionPath,
        value: {},
      },
      x_spark: {
        nodeRole: 'single-model-edit',
        phaseId,
        sectionPath,
        publishPath,
      },
    }
  }

  if (input.nodeKind === 'loop') {
    return {
      type: 'loop',
      title,
      desc,
      loop: {
        mode: 'progressive',
        maxLoopCount: 10,
        exitNodeId: 'loop.exit',
        subGraph: {
          id: `${nodeId}.loop.subGraph`,
          nodes: [
            {
              id: 'loop.exit',
              type: 'custom',
              position: { x: 420, y: 180 },
              data: { type: 'exit-loop', title: 'Exit Loop' },
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    }
  }

  return {
    type: input.nodeKind,
    title,
    desc,
  }
}

function defaultNodeTitle(kind: WorkflowDesignNodeCreateKind, nodeId: string): string {
  if (kind === 'tool') return 'Single Model Edit'
  if (kind === 'loop') return 'Loop Group'
  if (kind === 'start') return 'Start'
  if (kind === 'end') return 'End'
  if (kind === 'exit-loop') return 'Exit Loop'
  return nodeId
}

function isWorkflowDesignGraph(value: unknown): value is WorkflowDesignGraph {
  if (!isRecordValue(value)) return false
  return Array.isArray(value['nodes']) && Array.isArray(value['edges'])
}

function ensureNodeData(node: WorkflowDesignGraphNode): WorkflowDesignNodeData {
  node.data ??= {}
  return node.data
}

function ensureDocumentSpark(document: WorkflowDesignDocument): JsonRecord {
  if (!isRecordValue(document.x_spark)) {
    document.x_spark = {}
  }
  return document.x_spark
}

function ensureRecord(parent: JsonRecord, key: string): JsonRecord {
  const current = parent[key]
  if (isRecordValue(current)) return current
  const created: JsonRecord = {}
  parent[key] = created
  return created
}

function isRecordValue(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
