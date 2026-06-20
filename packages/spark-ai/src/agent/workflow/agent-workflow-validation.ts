/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-validation
 * 职责：校验 Agent Workflow Definition 的结构完整性，供发布和运行前验收复用。
 * 边界：默认只做同步 JSON 结构检查；不解析 ClassModel 运行时、不加载外部 workflow 文件。
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

type AgentWorkflowArrayFieldValidationCommand = Readonly<{
  record: Readonly<Record<string, unknown>>
  field: string
  path: string
  issues: AgentWorkflowValidationIssueSink
  nodeId?: string
}>

type AgentWorkflowErrorIssueDetail = Readonly<{
  code: string
  message: string
}>

export type ValidateAgentWorkflowDefinitionOptions = Readonly<{
  strict?: boolean
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
    validateEdgeData(edge['data'], `${path}.data`, issues)
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
  const { type, data, context } = command
  const { path, nodeId, issues } = context
  const dataType = data['type']
  if (dataType !== undefined && dataType !== type) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_NODE_DATA_TYPE_MISMATCH',
        message: `${path}.type must equal node type "${type}" when provided.`,
      },
      `${path}.type`,
      nodeId,
    ))
  }
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
  if (type === 'start') {
    validateStartNodeData({ data, context })
  }
  if (type === 'node') {
    validateBusinessNodeData({ data, context })
  }
  if (type === 'output') {
    validateOutputNodeData({ data, context })
  }
}

function validateStartNodeData(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  validateOptionalObject({ record: data, field: 'inputs', context: { path: `${path}.inputs`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'projection', context: { path: `${path}.projection`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'validation', context: { path: `${path}.validation`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'state', context: { path: `${path}.state`, nodeId, issues } })
  validateOptionalCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
}

function validateBusinessNodeData(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  const model = expectObject({ record: data, field: 'model', path: `${path}.model`, issues })
  expectObject({ record: data, field: 'inputs', path: `${path}.inputs`, issues })
  expectObject({ record: data, field: 'outputs', path: `${path}.outputs`, issues })
  const llm = expectObject({ record: data, field: 'llm', path: `${path}.llm`, issues })
  const validation = expectObject({ record: data, field: 'validation', path: `${path}.validation`, issues })
  const runtimeBinding = expectObject({
    record: data,
    field: 'runtimeBinding',
    path: `${path}.runtimeBinding`,
    issues,
  })
  validateOptionalCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'state', context: { path: `${path}.state`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'result', context: { path: `${path}.result`, nodeId, issues } })

  if (model !== undefined) {
    expectNonBlankString({ record: model, field: 'rootClassName', path: `${path}.model.rootClassName`, issues })
    expectNonBlankString({ record: model, field: 'className', path: `${path}.model.className`, issues })
    validateOptionalText({ record: model, field: 'contextPath', path: `${path}.model.contextPath`, nodeId, issues })
  }

  if (llm !== undefined) {
    expectObject({ record: llm, field: 'task', path: `${path}.llm.task`, issues })
    expectObject({ record: llm, field: 'knowledge', path: `${path}.llm.knowledge`, issues })
    expectObject({ record: llm, field: 'functionCalling', path: `${path}.llm.functionCalling`, issues })
    expectObject({ record: llm, field: 'output', path: `${path}.llm.output`, issues })
  }

  if (validation !== undefined) {
    const action = expectObject({
      record: validation,
      field: 'action',
      path: `${path}.validation.action`,
      issues,
    })
    validateOptionalText({ record: validation, field: 'status', path: `${path}.validation.status`, nodeId, issues })
    validateOptionalIssueArray({ value: validation['issues'], context: { path: `${path}.validation.issues`, nodeId, issues } })
    if (action !== undefined) {
      expectNonBlankString({
        record: action,
        field: 'className',
        path: `${path}.validation.action.className`,
        issues,
      })
      expectNonBlankString({
        record: action,
        field: 'actionName',
        path: `${path}.validation.action.actionName`,
        issues,
      })
      expectObject({
        record: action,
        field: 'inputProjection',
        path: `${path}.validation.action.inputProjection`,
        issues,
      })
      expectObject({
        record: action,
        field: 'expectedResult',
        path: `${path}.validation.action.expectedResult`,
        issues,
      })
    }
  }

  if (runtimeBinding !== undefined) {
    validateRuntimeBinding(runtimeBinding, { path: `${path}.runtimeBinding`, nodeId, issues })
  }
}

function validateRuntimeBinding(
  runtimeBinding: Readonly<Record<string, unknown>>,
  context: AgentWorkflowValidationPathContext,
): void {
  const { path, nodeId, issues } = context
  const registration = expectObject({
    record: runtimeBinding,
    field: 'registration',
    path: `${path}.registration`,
    issues,
  })
  if (registration !== undefined) {
    expectNonBlankString({ record: registration, field: 'alias', path: `${path}.registration.alias`, issues })
    expectNonBlankString({ record: registration, field: 'moduleId', path: `${path}.registration.moduleId`, issues })
    expectNonBlankString({ record: registration, field: 'businessId', path: `${path}.registration.businessId`, issues })
  }

  const inputContract = expectObject({
    record: runtimeBinding,
    field: 'inputContract',
    path: `${path}.inputContract`,
    issues,
  })
  if (inputContract !== undefined) {
    expectNonBlankString({
      record: inputContract,
      field: 'identityField',
      path: `${path}.inputContract.identityField`,
      issues,
    })
    expectNonBlankString({
      record: inputContract,
      field: 'messageField',
      path: `${path}.inputContract.messageField`,
      issues,
    })
    expectObject({
      record: inputContract,
      field: 'paramsSchema',
      path: `${path}.inputContract.paramsSchema`,
      issues,
    })
    validateOptionalStringArray({
      value: inputContract['readonlySteps'],
      context: { path: `${path}.inputContract.readonlySteps`, nodeId, issues },
    })
  }

  const systemPrompt = expectObject({
    record: runtimeBinding,
    field: 'systemPrompt',
    path: `${path}.systemPrompt`,
    issues,
  })
  if (systemPrompt !== undefined) {
    expectNonBlankString({ record: systemPrompt, field: 'template', path: `${path}.systemPrompt.template`, issues })
    validateOptionalConditionalHints(systemPrompt['conditionalHints'], {
      path: `${path}.systemPrompt.conditionalHints`,
      nodeId,
      issues,
    })
  }

  const knowledge = expectObject({
    record: runtimeBinding,
    field: 'knowledge',
    path: `${path}.knowledge`,
    issues,
  })
  if (knowledge !== undefined) {
    expectNonBlankString({ record: knowledge, field: 'rootClassName', path: `${path}.knowledge.rootClassName`, issues })
    expectNonBlankString({ record: knowledge, field: 'manifestUrlRef', path: `${path}.knowledge.manifestUrlRef`, issues })
  }

  const resolveInstance = expectObject({
    record: runtimeBinding,
    field: 'resolveInstance',
    path: `${path}.resolveInstance`,
    issues,
  })
  if (resolveInstance !== undefined) {
    expectNonBlankString({
      record: resolveInstance,
      field: 'editorSource',
      path: `${path}.resolveInstance.editorSource`,
      issues,
    })
    expectNonBlankString({
      record: resolveInstance,
      field: 'identityField',
      path: `${path}.resolveInstance.identityField`,
      issues,
    })
  }

  const moduleClassRef = expectObject({
    record: runtimeBinding,
    field: 'moduleClassRef',
    path: `${path}.moduleClassRef`,
    issues,
  })
  if (moduleClassRef !== undefined) {
    expectNonBlankString({ record: moduleClassRef, field: 'kind', path: `${path}.moduleClassRef.kind`, issues })
  }

  validateOptionalToolLoopNudge(runtimeBinding['toolLoopNudge'], {
    path: `${path}.toolLoopNudge`,
    nodeId,
    issues,
  })
  validateOptionalBeforeFunctionCall(runtimeBinding['beforeFunctionCall'], {
    path: `${path}.beforeFunctionCall`,
    nodeId,
    issues,
  })
  validateOptionalStringArray({
    value: runtimeBinding['executionToolNames'],
    context: { path: `${path}.executionToolNames`, nodeId, issues },
  })
  validateOptionalStringArray({
    value: runtimeBinding['planWithoutToolMarkers'],
    context: { path: `${path}.planWithoutToolMarkers`, nodeId, issues },
  })
  validateOptionalText({
    record: runtimeBinding,
    field: 'agentCompleteMethodName',
    path: `${path}.agentCompleteMethodName`,
    nodeId,
    issues,
  })
}

function validateOptionalConditionalHints(
  value: unknown,
  context: AgentWorkflowValidationPathContext,
): void {
  const hints = expectOptionalArray(value, context)
  if (hints === undefined) return
  const { path, nodeId, issues } = context
  hints.forEach((hint, index) => {
    const hintPath = `${path}[${index}]`
    if (!isJsonRecord(hint)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_RUNTIME_HINT_INVALID',
          message: `${hintPath} must be an object.`,
        },
        hintPath,
        nodeId,
      ))
      return
    }
    expectObject({ record: hint, field: 'when', path: `${hintPath}.when`, issues })
    expectNonBlankString({ record: hint, field: 'template', path: `${hintPath}.template`, issues })
  })
}

function validateOptionalToolLoopNudge(
  value: unknown,
  context: AgentWorkflowValidationPathContext,
): void {
  if (value === undefined) return
  const { path, nodeId, issues } = context
  if (!isJsonRecord(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_RUNTIME_NUDGE_INVALID', message: `${path} must be an object when provided.` },
      path,
      nodeId,
    ))
    return
  }
  const templates = expectObject({ record: value, field: 'templates', path: `${path}.templates`, issues })
  if (templates !== undefined) {
    for (const [key, template] of Object.entries(templates)) {
      if (typeof template !== 'string' || template.trim().length === 0) {
        issues.push(errorIssue(
          {
            code: 'AGENT_WORKFLOW_RUNTIME_NUDGE_TEMPLATE_INVALID',
            message: `${path}.templates.${key} must be a non-empty string.`,
          },
          `${path}.templates.${key}`,
          nodeId,
        ))
      }
    }
  }
  validateOptionalStringArray({
    value: value['contextFields'],
    context: { path: `${path}.contextFields`, nodeId, issues },
  })
}

function validateOptionalBeforeFunctionCall(
  value: unknown,
  context: AgentWorkflowValidationPathContext,
): void {
  if (value === undefined) return
  const { path, nodeId, issues } = context
  if (!isJsonRecord(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_RUNTIME_GATE_INVALID', message: `${path} must be an object when provided.` },
      path,
      nodeId,
    ))
    return
  }
  const rules = expectArray({
    record: value,
    field: 'gateRules',
    path: `${path}.gateRules`,
    issues,
    ...(nodeId === undefined ? {} : { nodeId }),
  })
  if (rules === undefined) return
  rules.forEach((rule, index) => {
    const rulePath = `${path}.gateRules[${index}]`
    if (!isJsonRecord(rule)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_RUNTIME_GATE_RULE_INVALID',
          message: `${rulePath} must be an object.`,
        },
        rulePath,
        nodeId,
      ))
      return
    }
    expectNonBlankString({ record: rule, field: 'kind', path: `${rulePath}.kind`, issues })
  })
}

function validateOutputNodeData(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  expectObject({ record: data, field: 'outputs', path: `${path}.outputs`, issues })
  validateOptionalObject({ record: data, field: 'upstreamValidation', context: { path: `${path}.upstreamValidation`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'validation', context: { path: `${path}.validation`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'state', context: { path: `${path}.state`, nodeId, issues } })
  validateOptionalObject({ record: data, field: 'result', context: { path: `${path}.result`, nodeId, issues } })
  validateOptionalCapabilities({ value: data['capabilities'], context: { path: `${path}.capabilities`, nodeId, issues } })
}

function validateForbiddenNodeDataFields(command: AgentWorkflowNodeFieldValidationCommand): void {
  const { data, context } = command
  const { path, nodeId, issues } = context
  for (const field of ['provider', 'toolName', 'workflowRef', 'inputMapping', 'outputMapping', 'toolParameters'] as const) {
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

function validateEdgeData(
  value: unknown,
  path: string,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  if (value === undefined) return
  if (!isJsonRecord(value)) {
    issues.push(errorIssue(
      {
        code: 'AGENT_WORKFLOW_EDGE_DATA_INVALID',
        message: `${path} must be an object when provided.`,
      },
      path,
    ))
    return
  }
  const projection = value['projection']
  if (projection !== undefined) {
    if (!isJsonRecord(projection)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_EDGE_PROJECTION_INVALID',
          message: `${path}.projection must be an object when provided.`,
        },
        `${path}.projection`,
      ))
    } else {
      expectNonBlankString({ record: projection, field: 'sourceRef', path: `${path}.projection.sourceRef`, issues })
      expectNonBlankString({ record: projection, field: 'targetRef', path: `${path}.projection.targetRef`, issues })
      validateOptionalObject({ record: projection, field: 'transform', context: { path: `${path}.projection.transform`, nodeId: undefined, issues } })
    }
  }
  const branch = value['branch']
  if (branch !== undefined) {
    if (!isJsonRecord(branch)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_EDGE_BRANCH_INVALID',
          message: `${path}.branch must be an object when provided.`,
        },
        `${path}.branch`,
      ))
    } else {
      validateOptionalText({ record: branch, field: 'condition', path: `${path}.branch.condition`, nodeId: undefined, issues })
      validateOptionalText({ record: branch, field: 'label', path: `${path}.branch.label`, nodeId: undefined, issues })
      const priority = branch['priority']
      if (priority !== undefined && typeof priority !== 'number') {
        issues.push(errorIssue(
          {
            code: 'AGENT_WORKFLOW_EDGE_BRANCH_PRIORITY_INVALID',
            message: `${path}.branch.priority must be a number when provided.`,
          },
          `${path}.branch.priority`,
        ))
      }
      const defaultValue = branch['default']
      if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
        issues.push(errorIssue(
          {
            code: 'AGENT_WORKFLOW_EDGE_BRANCH_DEFAULT_INVALID',
            message: `${path}.branch.default must be a boolean when provided.`,
          },
          `${path}.branch.default`,
        ))
      }
    }
  }
  const validation = value['validation']
  if (validation !== undefined) {
    if (!isJsonRecord(validation)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_EDGE_VALIDATION_INVALID',
          message: `${path}.validation must be an object when provided.`,
        },
        `${path}.validation`,
      ))
    } else {
      validateOptionalText({ record: validation, field: 'status', path: `${path}.validation.status`, nodeId: undefined, issues })
      validateOptionalIssueArray({ value: validation['issues'], context: { path: `${path}.validation.issues`, nodeId: undefined, issues } })
    }
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

function validateOptionalText(command: AgentWorkflowRequiredFieldCommand & Readonly<{ nodeId: string | undefined }>): void {
  const { record, field, path, issues, nodeId } = command
  const value = record[field]
  if (value === undefined) return
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_OPTIONAL_TEXT_INVALID', message: `${path} must be a non-empty string when provided.` },
      path,
      nodeId,
    ))
  }
}

function validateOptionalIssueArray(command: AgentWorkflowCapabilitiesValidationCommand): void {
  const { value, context } = command
  const { path, nodeId, issues } = context
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_ISSUES_NOT_ARRAY', message: `${path} must be an array when provided.` },
      path,
      nodeId,
    ))
    return
  }
  value.forEach((item, index) => {
    if (!isJsonRecord(item)) {
      issues.push(errorIssue(
        {
          code: 'AGENT_WORKFLOW_ISSUE_INVALID',
          message: `${path}[${index}] must be an object.`,
        },
        `${path}[${index}]`,
        nodeId,
      ))
    }
  })
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

function expectArray(command: AgentWorkflowArrayFieldValidationCommand): readonly unknown[] | undefined {
  const { record, field, path, issues, nodeId } = command
  const value = record[field]
  if (!Array.isArray(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_REQUIRED_ARRAY_MISSING', message: `${path} must be an array.` },
      path,
      nodeId,
    ))
    return undefined
  }
  return copyUnknownArray(value)
}

function expectOptionalArray(
  value: unknown,
  context: AgentWorkflowValidationPathContext,
): readonly unknown[] | undefined {
  const { path, nodeId, issues } = context
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    issues.push(errorIssue(
      { code: 'AGENT_WORKFLOW_OPTIONAL_ARRAY_INVALID', message: `${path} must be an array when provided.` },
      path,
      nodeId,
    ))
    return undefined
  }
  return copyUnknownArray(value)
}

function copyUnknownArray(value: readonly unknown[]): readonly unknown[] {
  const items: unknown[] = []
  for (const item of value) items.push(item)
  return items
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
