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

type AgentWorkflowValidationPathContext = Readonly<{
  path: string
  nodeId: string | undefined
  issues: AgentWorkflowValidationIssueSink
}>

type AgentWorkflowNodeDataValidationCommand = Readonly<{
  type: string
  data: Readonly<Record<string, unknown>>
  context: AgentWorkflowValidationPathContext
  options: ValidateAgentWorkflowDefinitionOptions
}>

type AgentWorkflowNodeFieldValidationCommand = Readonly<{
  data: Readonly<Record<string, unknown>>
  context: AgentWorkflowValidationPathContext
}>

type AgentWorkflowCapabilitiesValidationCommand = Readonly<{
  value: unknown
  context: AgentWorkflowValidationPathContext
}>

type AgentWorkflowOptionalObjectValidationCommand = Readonly<{
  record: Readonly<Record<string, unknown>>
  field: string
  context: AgentWorkflowValidationPathContext
}>

type AgentWorkflowErrorIssueDetail = Readonly<{
  code: string
  message: string
}>

export type ValidateAgentWorkflowDefinitionOptions = Readonly<{
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
      {
        code: 'AGENT_WORKFLOW_DEFINITION_NOT_OBJECT',
        message: 'Agent workflow definition must be a JSON object.',
      },
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
        {
          code: 'AGENT_WORKFLOW_FORBIDDEN_FIELD',
          message: `definition.${field} is not allowed in workflow definition.`,
        },
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
      {
        code: 'AGENT_WORKFLOW_SOURCE_ID_MISMATCH',
        message: `source.designId "${designId}" must equal workflowId "${workflowId}".`,
      },
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
      {
        code: 'AGENT_WORKFLOW_VARIABLES_NOT_ARRAY',
        message: 'definition.workflow.variables must be an array.',
      },
      'definition.workflow.variables',
    ))
  }
  const capabilities = workflow['capabilities']
  validateCapabilities({
    value: capabilities,
    context: { path: 'definition.workflow.capabilities', nodeId: undefined, issues },
  })

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
      {
        code: 'AGENT_WORKFLOW_NODES_NOT_ARRAY',
        message: 'definition.workflow.graph.nodes must be an array.',
      },
      'definition.workflow.graph.nodes',
    ))
    return
  }
  if (!Array.isArray(edgesValue)) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_EDGES_NOT_ARRAY',
        message: 'definition.workflow.graph.edges must be an array.',
      },
      'definition.workflow.graph.edges',
    ))
    return
  }

  const nodeIds = new Set<string>()
  const startIds: string[] = []
  const outputIds = new Set<string>()
  nodesValue.forEach((node, index) => {
    const path = `definition.workflow.graph.nodes[${index}]`
    if (!isJsonRecord(node)) {
      issues.push(errorIssue({ code: 'AGENT_WORKFLOW_NODE_NOT_OBJECT', message: `${path} must be an object.` }, path))
      return
    }
    const nodeId = expectNonBlankString({ record: node, field: 'id', path: `${path}.id`, issues })
    const type = expectNonBlankString({ record: node, field: 'type', path: `${path}.type`, issues })
    if (nodeId !== undefined) {
      if (nodeIds.has(nodeId)) {
        issues.push(errorIssue(
          { code: 'AGENT_WORKFLOW_DUPLICATE_NODE_ID', message: `Duplicate node id "${nodeId}".` },
          `${path}.id`,
          nodeId,
        ))
      }
      nodeIds.add(nodeId)
    }
    if (type !== undefined && !isAllowedNodeType(type)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_UNKNOWN_NODE_TYPE',
          message: `Node type "${type}" is not supported by workflow definition.`,
        },
        `${path}.type`,
        nodeId,
      ))
      return
    }
    const data = expectObject({ record: node, field: 'data', path: `${path}.data`, issues })
    if (type === 'start' && nodeId !== undefined) startIds.push(nodeId)
    if (type === 'output' && nodeId !== undefined) outputIds.add(nodeId)
    if (data === undefined || type === undefined) return
    validateNodeData({
      type,
      data,
      context: { path: `${path}.data`, nodeId, issues },
      options,
    })
  })

  if (startIds.length === 0) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_START_NODE_MISSING',
        message: 'Workflow graph must contain at least one start node.',
      },
      'definition.workflow.graph.nodes',
    ))
  }
  if (outputIds.size === 0) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_OUTPUT_NODE_MISSING',
        message: 'Workflow graph must contain at least one output node.',
      },
      'definition.workflow.graph.nodes',
    ))
  }

  const adjacency = new Map<string, string[]>()
  edgesValue.forEach((edge, index) => {
    const path = `definition.workflow.graph.edges[${index}]`
    if (!isJsonRecord(edge)) {
      issues.push(errorIssue({ code: 'AGENT_WORKFLOW_EDGE_NOT_OBJECT', message: `${path} must be an object.` }, path))
      return
    }
    expectNonBlankString({ record: edge, field: 'id', path: `${path}.id`, issues })
    const source = expectNonBlankString({ record: edge, field: 'source', path: `${path}.source`, issues })
    const target = expectNonBlankString({ record: edge, field: 'target', path: `${path}.target`, issues })
    if (source !== undefined && !nodeIds.has(source)) {
      issues.push(errorIssue(
        { code: 'AGENT_WORKFLOW_EDGE_SOURCE_MISSING', message: `Edge source "${source}" does not exist.` },
        `${path}.source`,
      ))
    }
    if (target !== undefined && !nodeIds.has(target)) {
      issues.push(errorIssue(
        { code: 'AGENT_WORKFLOW_EDGE_TARGET_MISSING', message: `Edge target "${target}" does not exist.` },
        `${path}.target`,
      ))
    }
    if (source === undefined || target === undefined) return
    const targets = adjacency.get(source) ?? []
    targets.push(target)
    adjacency.set(source, targets)
  })

  if (startIds.length > 0 && outputIds.size > 0 && !canReachOutput(startIds, outputIds, adjacency)) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_OUTPUT_NOT_REACHABLE',
        message: 'Workflow graph must contain a path from start to output.',
      },
      'definition.workflow.graph.edges',
    ))
  }
}

function validateNodeData(command: AgentWorkflowNodeDataValidationCommand): void {
  const { type, data, context, options } = command
  const { path, nodeId, issues } = context
  validateForbiddenNodeDataFields({ data, context })
  if (Object.prototype.hasOwnProperty.call(data, 'tool_name') || data['toolName'] === 'single_model_edit') {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_LEGACY_TOOL_NODE',
        message: 'single_model_edit and tool_name are not allowed in workflow definition.',
      },
      path,
      nodeId,
    ))
  }
  if (type === 'tool') {
    validateToolNodeData({ data, context })
  }
  if (type === 'chatflow') {
    validateChatflowNodeData({ type, data, context, options })
  }
  if (type === 'workflow') {
    validateWorkflowRefNodeData({ data, context })
  }
  if (type === 'output') {
    validateOutputNodeData({ data, context })
  }
}

function validateToolNodeData(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  expectNonBlankString({ record: data, field: 'provider', path: `${path}.provider`, issues })
  expectNonBlankString({ record: data, field: 'toolName', path: `${path}.toolName`, issues })
  expectObject({ record: data, field: 'inputs', path: `${path}.inputs`, issues })
  expectObject({ record: data, field: 'outputs', path: `${path}.outputs`, issues })
  validateCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
}

function validateChatflowNodeData(command: AgentWorkflowNodeDataValidationCommand): void {
  const { data, context, options } = command
  const { path, nodeId, issues } = context
  const workflowRef = expectObject({ record: data, field: 'workflowRef', path: `${path}.workflowRef`, issues })
  expectObject({ record: data, field: 'inputs', path: `${path}.inputs`, issues })
  expectObject({ record: data, field: 'outputs', path: `${path}.outputs`, issues })
  validateOptionalCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
  if (workflowRef === undefined) return
  const reference = validateWorkflowReference(workflowRef, `${path}.workflowRef`, issues)
  if (reference === undefined) return
  const shouldValidateReference = options.validateReferencedWorkflows ?? true
  if (!shouldValidateReference || options.loadWorkflowDefinition === undefined) return
  const loaded = options.loadWorkflowDefinition(reference)
  if (loaded === undefined) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_CHATFLOW_DEFINITION_NOT_FOUND',
        message: 'Chatflow node must reference a loadable workflow definition.',
      },
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

function validateWorkflowRefNodeData(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  const workflowRef = expectObject({ record: data, field: 'workflowRef', path: `${path}.workflowRef`, issues })
  expectObject({ record: data, field: 'inputs', path: `${path}.inputs`, issues })
  expectObject({ record: data, field: 'outputs', path: `${path}.outputs`, issues })
  validateOptionalCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
  if (workflowRef !== undefined) {
    validateWorkflowReference(workflowRef, `${path}.workflowRef`, issues)
  }
}

function validateOutputNodeData(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  expectObject({ record: data, field: 'outputs', path: `${path}.outputs`, issues })
  validateOptionalCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
}

function validateForbiddenNodeDataFields(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  for (const field of ['inputMapping', 'outputMapping', 'toolParameters'] as const) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_LEGACY_NODE_FIELD',
          message: `${path}.${field} is not allowed in workflow definition.`,
        },
        `${path}.${field}`,
        nodeId,
      ))
    }
  }
  const spark = data['x_spark']
  if (isJsonRecord(spark) && Object.prototype.hasOwnProperty.call(spark, 'classModel')) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_LEGACY_CLASS_MODEL_META',
        message: `${path}.x_spark.classModel is not allowed in workflow definition.`,
      },
      `${path}.x_spark.classModel`,
      nodeId,
    ))
  }
}

function validateOptionalCapabilities(command: AgentWorkflowCapabilitiesValidationCommand): void {
  const { value } = command
  if (value === undefined) return
  validateCapabilities(command)
}

function validateCapabilities(command: AgentWorkflowCapabilitiesValidationCommand): void {
  const { value, context } = command
  const { path, nodeId, issues } = context
  if (!Array.isArray(value)) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_CAPABILITIES_NOT_ARRAY',
        message: `${path} must be an array.`,
      },
      path,
      nodeId,
    ))
    return
  }

  value.forEach((capability, index) => {
    const capabilityPath = `${path}[${index}]`
    if (!isJsonRecord(capability)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_CAPABILITY_NOT_OBJECT',
          message: `${capabilityPath} must be an object.`,
        },
        capabilityPath,
        nodeId,
      ))
      return
    }
    expectNonBlankString({ record: capability, field: 'id', path: `${capabilityPath}.id`, issues })
    expectNonBlankString({ record: capability, field: 'title', path: `${capabilityPath}.title`, issues })
    expectNonBlankString({ record: capability, field: 'scope', path: `${capabilityPath}.scope`, issues })
    expectNonBlankString({ record: capability, field: 'description', path: `${capabilityPath}.description`, issues })
    validateOptionalObject({ record: capability, field: 'inputs', context: { path: `${capabilityPath}.inputs`, nodeId, issues } })
    validateOptionalObject({ record: capability, field: 'outputs', context: { path: `${capabilityPath}.outputs`, nodeId, issues } })
    validateOptionalStringArray({ value: capability['constraints'], context: { path: `${capabilityPath}.constraints`, nodeId, issues } })
  })
}

function validateOptionalObject(command: AgentWorkflowOptionalObjectValidationCommand): void {
  const { record, field, context } = command
  const { path, nodeId, issues } = context
  const value = record[field]
  if (value === undefined) return
  if (!isJsonRecord(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_OPTIONAL_OBJECT_INVALID', message: `${path} must be an object when provided.` },
      path,
      nodeId,
    ))
  }
}

function validateOptionalStringArray(command: AgentWorkflowCapabilitiesValidationCommand): void {
  const { value, context } = command
  const { path, nodeId, issues } = context
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_CONSTRAINTS_NOT_ARRAY', message: `${path} must be an array when provided.` },
      path,
      nodeId,
    ))
    return
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_CONSTRAINT_INVALID',
          message: `${path}[${index}] must be a non-empty string.`,
        },
        `${path}[${index}]`,
        nodeId,
      ))
    }
  })
}

function validateWorkflowReference(
  workflowRef: Readonly<Record<string, unknown>>,
  path: string,
  issues: AgentWorkflowDefinitionValidationIssue[],
): AgentWorkflowReference | undefined {
  const workflowId = expectNonBlankString({ record: workflowRef, field: 'workflowId', path: `${path}.workflowId`, issues })
  let referenceValid = workflowId !== undefined
  const version = workflowRef['version']
  if (version !== undefined && typeof version !== 'number') {
    referenceValid = false
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_REFERENCE_VERSION_INVALID', message: `${path}.version must be a number.` },
      `${path}.version`,
    ))
  }
  const definitionPath = workflowRef['definitionPath']
  if (definitionPath !== undefined && (typeof definitionPath !== 'string' || definitionPath.trim().length === 0)) {
    referenceValid = false
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_REFERENCE_PATH_INVALID',
        message: `${path}.definitionPath must be a non-empty string when provided.`,
      },
      `${path}.definitionPath`,
    ))
  }
  if (!referenceValid || workflowId === undefined) return undefined
  return {
    workflowId,
    ...(typeof version === 'number' ? { version } : {}),
    ...(typeof definitionPath === 'string' && definitionPath.trim().length > 0
      ? { definitionPath: definitionPath.trim() }
      : {}),
  }
}

function canReachOutput(
  startIds: readonly string[],
  outputIds: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, readonly string[]>,
): boolean {
  const visited = new Set<string>()
  const queue = [...startIds]
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (nodeId === undefined || visited.has(nodeId)) continue
    if (outputIds.has(nodeId)) return true
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
    issues.push(errorIssue({ code: 'AGENT_WORKFLOW_REQUIRED_OBJECT_MISSING', message: `${path} must be an object.` }, path))
    return undefined
  }
  return value
}

function expectString(command: AgentWorkflowExpectedFieldCommand<string>): void {
  const { record, field, expected, path, issues } = command
  const value = record[field]
  if (value !== expected) {
    issues.push(errorIssue({ code: 'AGENT_WORKFLOW_FIELD_MISMATCH', message: `${path} must be "${expected}".` }, path))
  }
}

function expectNumber(command: AgentWorkflowExpectedFieldCommand<number>): void {
  const { record, field, expected, path, issues } = command
  const value = record[field]
  if (value !== expected) {
    issues.push(errorIssue({ code: 'AGENT_WORKFLOW_FIELD_MISMATCH', message: `${path} must be ${expected}.` }, path))
  }
}

function expectNonBlankString(command: AgentWorkflowRequiredFieldCommand): string | undefined {
  const { record, field, path, issues } = command
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(errorIssue({ code: 'AGENT_WORKFLOW_REQUIRED_TEXT_MISSING', message: `${path} must be a non-empty string.` }, path))
    return undefined
  }
  return value
}

function errorIssue(
  detail: AgentWorkflowErrorIssueDetail,
  path: string,
  nodeId?: string,
): AgentWorkflowDefinitionValidationIssue {
  return {
    severity: 'error',
    code: detail.code,
    message: detail.message,
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
