/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-validation
 * 职责：校验 Agent Workflow Definition 的结构完整性，供发布和运行前验收复用。
 * 边界：默认只做同步 JSON 结构检查；外部解析 ClassModel Tool 或 Chatflow 文件时通过 options 注入。
 * AI用途：需要判断 definition 是否可发布或可进入 dryRun 链路时，用本模块确认校验规则。
 */

import {
  AGENT_WORKFLOW_DEFINITION_KIND,
  AGENT_WORKFLOW_DEFINITION_SCHEMA,
  AGENT_WORKFLOW_DEFINITION_VERSION,
  AGENT_WORKFLOW_GRAPH_NODE_TYPES,
  type AgentWorkflowDefinition,
  type AgentWorkflowDefinitionValidation,
  type AgentWorkflowDefinitionValidationIssue,
  type AgentWorkflowReference,
  type AgentWorkflowToolDescriptor,
  type AgentWorkflowToolNodeData,
} from './agent-workflow-definition'

type AgentWorkflowValidationIssueSink = AgentWorkflowDefinitionValidationIssue[]

type AgentWorkflowExpectedFieldCommand<TExpected extends string | number> = Readonly<{
  record: Readonly<Record<string, unknown>>
  field: string
  expected: TExpected
  path: string
  issues: AgentWorkflowValidationIssueSink
}>

type AgentWorkflowRequiredFieldCommand = Readonly<{
  record: Readonly<Record<string, unknown>>
  field: string
  path: string
  issues: AgentWorkflowValidationIssueSink
}>

export type ValidateAgentWorkflowDefinitionOptions = Readonly<{
  resolveToolDescriptor?: (node: AgentWorkflowToolNodeData) => AgentWorkflowToolDescriptor | undefined
  loadWorkflowDefinition?: (ref: AgentWorkflowReference) => unknown
  validateReferencedWorkflows?: boolean
}>

export function createAgentWorkflowDefinitionValidation(
  issues: readonly AgentWorkflowDefinitionValidationIssue[] = [],
): AgentWorkflowDefinitionValidation {
  if (issues.some(issue => issue.severity === 'error')) {
    return { status: 'invalid', issues }
  }
  if (issues.length > 0) {
    return { status: 'warning', issues }
  }
  return { status: 'valid', issues }
}

export function validateAgentWorkflowDefinition(
  candidate: unknown,
  options: ValidateAgentWorkflowDefinitionOptions = {},
): AgentWorkflowDefinitionValidation {
  const issues: AgentWorkflowDefinitionValidationIssue[] = []
  if (!isJsonRecord(candidate)) {
    return createAgentWorkflowDefinitionValidation([errorIssue(
      'AGENT_WORKFLOW_DEFINITION_NOT_OBJECT',
      'Agent workflow definition must be a JSON object.',
      'definition',
    )])
  }

  validateForbiddenTopLevelFields(candidate, issues)
  expectString({
    record: candidate,
    field: 'kind',
    expected: AGENT_WORKFLOW_DEFINITION_KIND,
    path: 'definition.kind',
    issues,
  })
  expectNumber({
    record: candidate,
    field: 'version',
    expected: AGENT_WORKFLOW_DEFINITION_VERSION,
    path: 'definition.version',
    issues,
  })
  const workflowId = expectNonBlankString({
    record: candidate,
    field: 'workflowId',
    path: 'definition.workflowId',
    issues,
  })

  const source = expectObject({ record: candidate, field: 'source', path: 'definition.source', issues })
  if (source !== undefined) {
    validateSource(source, workflowId, issues)
  }

  const workflow = expectObject({ record: candidate, field: 'workflow', path: 'definition.workflow', issues })
  if (workflow !== undefined) {
    validateWorkflow(workflow, issues, options)
  }

  const spark = expectObject({ record: candidate, field: 'x_spark', path: 'definition.x_spark', issues })
  if (spark !== undefined) {
    validateSparkMeta(spark, issues)
  }

  return createAgentWorkflowDefinitionValidation(issues)
}

export function assertAgentWorkflowDefinition(candidate: unknown): asserts candidate is AgentWorkflowDefinition {
  const validation = validateAgentWorkflowDefinition(candidate)
  if (validation.status === 'invalid') {
    const message = validation.issues
      .filter(issue => issue.severity === 'error')
      .map(issue => issue.message)
      .join('; ')
    throw new Error(`Invalid agent workflow definition: ${message}`)
  }
}

function validateForbiddenTopLevelFields(
  record: Readonly<Record<string, unknown>>,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  for (const field of ['app', 'factory', 'process'] as const) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      issues.push(errorIssue(
        'AGENT_WORKFLOW_FORBIDDEN_FIELD',
        `definition.${field} is not allowed in workflow definition.`,
        `definition.${field}`,
      ))
    }
  }
}

function validateSource(
  source: Readonly<Record<string, unknown>>,
  workflowId: string | undefined,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  expectString({
    record: source,
    field: 'designKind',
    expected: 'agent.workflow.design',
    path: 'definition.source.designKind',
    issues,
  })
  const designId = expectNonBlankString({
    record: source,
    field: 'designId',
    path: 'definition.source.designId',
    issues,
  })
  expectNumber({
    record: source,
    field: 'designVersion',
    expected: 1,
    path: 'definition.source.designVersion',
    issues,
  })
  if (workflowId !== undefined && designId !== undefined && designId !== workflowId) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_SOURCE_ID_MISMATCH',
      `source.designId "${designId}" must equal workflowId "${workflowId}".`,
      'definition.source.designId',
    ))
  }
}

function validateSparkMeta(
  spark: Readonly<Record<string, unknown>>,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  expectString({
    record: spark,
    field: 'schema',
    expected: AGENT_WORKFLOW_DEFINITION_SCHEMA,
    path: 'definition.x_spark.schema',
    issues,
  })
  expectNonBlankString({
    record: spark,
    field: 'publishedAt',
    path: 'definition.x_spark.publishedAt',
    issues,
  })
  expectObject({ record: spark, field: 'validation', path: 'definition.x_spark.validation', issues })
}

function validateWorkflow(
  workflow: Readonly<Record<string, unknown>>,
  issues: AgentWorkflowDefinitionValidationIssue[],
  options: ValidateAgentWorkflowDefinitionOptions,
): void {
  const variables = workflow['variables']
  if (!Array.isArray(variables)) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_VARIABLES_NOT_ARRAY',
      'definition.workflow.variables must be an array.',
      'definition.workflow.variables',
    ))
  }

  const graph = expectObject({ record: workflow, field: 'graph', path: 'definition.workflow.graph', issues })
  if (graph === undefined) return
  validateGraph(graph, issues, options)
}

function validateGraph(
  graph: Readonly<Record<string, unknown>>,
  issues: AgentWorkflowDefinitionValidationIssue[],
  options: ValidateAgentWorkflowDefinitionOptions,
): void {
  const nodesValue = graph['nodes']
  const edgesValue = graph['edges']
  if (!Array.isArray(nodesValue)) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_NODES_NOT_ARRAY',
      'definition.workflow.graph.nodes must be an array.',
      'definition.workflow.graph.nodes',
    ))
    return
  }
  if (!Array.isArray(edgesValue)) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_EDGES_NOT_ARRAY',
      'definition.workflow.graph.edges must be an array.',
      'definition.workflow.graph.edges',
    ))
    return
  }

  const nodeIds = new Set<string>()
  const startIds: string[] = []
  const endIds = new Set<string>()
  nodesValue.forEach((node, index) => {
    const path = `definition.workflow.graph.nodes[${index}]`
    if (!isJsonRecord(node)) {
      issues.push(errorIssue('AGENT_WORKFLOW_NODE_NOT_OBJECT', `${path} must be an object.`, path))
      return
    }
    const nodeId = expectNonBlankString({ record: node, field: 'id', path: `${path}.id`, issues })
    const type = expectNonBlankString({ record: node, field: 'type', path: `${path}.type`, issues })
    if (nodeId !== undefined) {
      if (nodeIds.has(nodeId)) {
        issues.push(errorIssue('AGENT_WORKFLOW_DUPLICATE_NODE_ID', `Duplicate node id "${nodeId}".`, `${path}.id`, nodeId))
      }
      nodeIds.add(nodeId)
    }
    if (type !== undefined && !isAllowedNodeType(type)) {
      issues.push(errorIssue(
        'AGENT_WORKFLOW_UNKNOWN_NODE_TYPE',
        `Node type "${type}" is not supported by workflow definition.`,
        `${path}.type`,
        nodeId,
      ))
      return
    }
    const data = expectObject({ record: node, field: 'data', path: `${path}.data`, issues })
    if (type === 'start' && nodeId !== undefined) startIds.push(nodeId)
    if (type === 'end' && nodeId !== undefined) endIds.add(nodeId)
    if (data === undefined || type === undefined) return
    validateNodeData(type, data, `${path}.data`, nodeId, issues, options)
  })

  if (startIds.length === 0) {
    issues.push(errorIssue('AGENT_WORKFLOW_START_NODE_MISSING', 'Workflow graph must contain at least one start node.', 'definition.workflow.graph.nodes'))
  }
  if (endIds.size === 0) {
    issues.push(errorIssue('AGENT_WORKFLOW_END_NODE_MISSING', 'Workflow graph must contain at least one end node.', 'definition.workflow.graph.nodes'))
  }

  const adjacency = new Map<string, string[]>()
  edgesValue.forEach((edge, index) => {
    const path = `definition.workflow.graph.edges[${index}]`
    if (!isJsonRecord(edge)) {
      issues.push(errorIssue('AGENT_WORKFLOW_EDGE_NOT_OBJECT', `${path} must be an object.`, path))
      return
    }
    expectNonBlankString({ record: edge, field: 'id', path: `${path}.id`, issues })
    const source = expectNonBlankString({ record: edge, field: 'source', path: `${path}.source`, issues })
    const target = expectNonBlankString({ record: edge, field: 'target', path: `${path}.target`, issues })
    if (source !== undefined && !nodeIds.has(source)) {
      issues.push(errorIssue('AGENT_WORKFLOW_EDGE_SOURCE_MISSING', `Edge source "${source}" does not exist.`, `${path}.source`))
    }
    if (target !== undefined && !nodeIds.has(target)) {
      issues.push(errorIssue('AGENT_WORKFLOW_EDGE_TARGET_MISSING', `Edge target "${target}" does not exist.`, `${path}.target`))
    }
    if (source === undefined || target === undefined) return
    const targets = adjacency.get(source) ?? []
    targets.push(target)
    adjacency.set(source, targets)
  })

  if (startIds.length > 0 && endIds.size > 0 && !canReachEnd(startIds, endIds, adjacency)) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_END_NOT_REACHABLE',
      'Workflow graph must contain a path from start to end.',
      'definition.workflow.graph.edges',
    ))
  }
}

function validateNodeData(
  type: string,
  data: Readonly<Record<string, unknown>>,
  path: string,
  nodeId: string | undefined,
  issues: AgentWorkflowDefinitionValidationIssue[],
  options: ValidateAgentWorkflowDefinitionOptions,
): void {
  if (Object.prototype.hasOwnProperty.call(data, 'tool_name') || data['toolName'] === 'single_model_edit') {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_LEGACY_TOOL_NODE',
      'single_model_edit and tool_name are not allowed in workflow definition.',
      path,
      nodeId,
    ))
  }
  if (type === 'tool') {
    validateToolNodeData(data, path, nodeId, issues, options)
  }
  if (type === 'chatflow') {
    validateChatflowNodeData(data, path, nodeId, issues, options)
  }
  if (type === 'workflow') {
    validateWorkflowRefNodeData(data, path, nodeId, issues)
  }
}

function validateToolNodeData(
  data: Readonly<Record<string, unknown>>,
  path: string,
  nodeId: string | undefined,
  issues: AgentWorkflowDefinitionValidationIssue[],
  options: ValidateAgentWorkflowDefinitionOptions,
): void {
  const provider = expectNonBlankString({ record: data, field: 'provider', path: `${path}.provider`, issues })
  const toolName = expectNonBlankString({ record: data, field: 'toolName', path: `${path}.toolName`, issues })
  const toolParameters = expectObject({ record: data, field: 'toolParameters', path: `${path}.toolParameters`, issues })
  if (provider !== 'class-model' || toolParameters === undefined || toolName === undefined) return

  const descriptor = options.resolveToolDescriptor?.(data as AgentWorkflowToolNodeData)
  if (options.resolveToolDescriptor !== undefined && descriptor === undefined) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_TOOL_DESCRIPTOR_NOT_FOUND',
      `ClassModel tool descriptor not found for "${toolName}".`,
      `${path}.toolName`,
      nodeId,
    ))
    return
  }
  if (descriptor === undefined) return

  for (const parameter of descriptor.parameters) {
    if (!parameter.required) continue
    if (!Object.prototype.hasOwnProperty.call(toolParameters, parameter.name)) {
      issues.push(errorIssue(
        'AGENT_WORKFLOW_TOOL_PARAMETER_MISSING',
        `Required ${parameter.source} parameter "${parameter.name}" is not mapped for tool "${toolName}".`,
        `${path}.toolParameters.${parameter.name}`,
        nodeId,
      ))
    }
  }
}

function validateChatflowNodeData(
  data: Readonly<Record<string, unknown>>,
  path: string,
  nodeId: string | undefined,
  issues: AgentWorkflowDefinitionValidationIssue[],
  options: ValidateAgentWorkflowDefinitionOptions,
): void {
  const workflowRef = expectObject({ record: data, field: 'workflowRef', path: `${path}.workflowRef`, issues })
  expectObject({ record: data, field: 'inputMapping', path: `${path}.inputMapping`, issues })
  expectObject({ record: data, field: 'outputMapping', path: `${path}.outputMapping`, issues })
  if (workflowRef === undefined) return
  validateWorkflowReference(workflowRef, `${path}.workflowRef`, issues)
  const shouldValidateReference = options.validateReferencedWorkflows ?? true
  if (!shouldValidateReference || options.loadWorkflowDefinition === undefined) return
  const loaded = options.loadWorkflowDefinition(workflowRef as AgentWorkflowReference)
  if (loaded === undefined) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_CHATFLOW_DEFINITION_NOT_FOUND',
      'Chatflow node must reference a loadable workflow definition.',
      `${path}.workflowRef`,
      nodeId,
    ))
    return
  }
  const nested = validateAgentWorkflowDefinition(loaded, {
    ...options,
    validateReferencedWorkflows: false,
  })
  for (const issue of nested.issues) {
    issues.push({
      ...issue,
      path: issue.path === undefined ? `${path}.workflowRef` : `${path}.workflowRef.${issue.path}`,
      ...(nodeId === undefined ? {} : { nodeId }),
    })
  }
}

function validateWorkflowRefNodeData(
  data: Readonly<Record<string, unknown>>,
  path: string,
  _nodeId: string | undefined,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  const workflowRef = expectObject({ record: data, field: 'workflowRef', path: `${path}.workflowRef`, issues })
  expectObject({ record: data, field: 'inputMapping', path: `${path}.inputMapping`, issues })
  expectObject({ record: data, field: 'outputMapping', path: `${path}.outputMapping`, issues })
  if (workflowRef !== undefined) {
    validateWorkflowReference(workflowRef, `${path}.workflowRef`, issues)
  }
}

function validateWorkflowReference(
  workflowRef: Readonly<Record<string, unknown>>,
  path: string,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  expectNonBlankString({ record: workflowRef, field: 'workflowId', path: `${path}.workflowId`, issues })
  const version = workflowRef['version']
  if (version !== undefined && typeof version !== 'number') {
    issues.push(errorIssue('AGENT_WORKFLOW_REFERENCE_VERSION_INVALID', `${path}.version must be a number.`, `${path}.version`))
  }
  const definitionPath = workflowRef['definitionPath']
  if (definitionPath !== undefined && (typeof definitionPath !== 'string' || definitionPath.trim().length === 0)) {
    issues.push(errorIssue(
      'AGENT_WORKFLOW_REFERENCE_PATH_INVALID',
      `${path}.definitionPath must be a non-empty string when provided.`,
      `${path}.definitionPath`,
    ))
  }
}

function canReachEnd(
  startIds: readonly string[],
  endIds: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, readonly string[]>,
): boolean {
  const visited = new Set<string>()
  const queue = [...startIds]
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (nodeId === undefined || visited.has(nodeId)) continue
    if (endIds.has(nodeId)) return true
    visited.add(nodeId)
    for (const next of adjacency.get(nodeId) ?? []) {
      if (!visited.has(next)) queue.push(next)
    }
  }
  return false
}

function expectObject(command: AgentWorkflowRequiredFieldCommand): Readonly<Record<string, unknown>> | undefined {
  const { record, field, path, issues } = command
  const value = record[field]
  if (!isJsonRecord(value)) {
    issues.push(errorIssue('AGENT_WORKFLOW_REQUIRED_OBJECT_MISSING', `${path} must be an object.`, path))
    return undefined
  }
  return value
}

function expectString(command: AgentWorkflowExpectedFieldCommand<string>): void {
  const { record, field, expected, path, issues } = command
  const value = record[field]
  if (value !== expected) {
    issues.push(errorIssue('AGENT_WORKFLOW_FIELD_MISMATCH', `${path} must be "${expected}".`, path))
  }
}

function expectNumber(command: AgentWorkflowExpectedFieldCommand<number>): void {
  const { record, field, expected, path, issues } = command
  const value = record[field]
  if (value !== expected) {
    issues.push(errorIssue('AGENT_WORKFLOW_FIELD_MISMATCH', `${path} must be ${expected}.`, path))
  }
}

function expectNonBlankString(command: AgentWorkflowRequiredFieldCommand): string | undefined {
  const { record, field, path, issues } = command
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(errorIssue('AGENT_WORKFLOW_REQUIRED_TEXT_MISSING', `${path} must be a non-empty string.`, path))
    return undefined
  }
  return value
}

function errorIssue(
  code: string,
  message: string,
  path: string,
  nodeId?: string,
): AgentWorkflowDefinitionValidationIssue {
  return {
    severity: 'error',
    code,
    message,
    ...(nodeId === undefined ? {} : { nodeId }),
    path,
  }
}

function isAllowedNodeType(value: string): boolean {
  return AGENT_WORKFLOW_GRAPH_NODE_TYPES.some(type => type === value)
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
