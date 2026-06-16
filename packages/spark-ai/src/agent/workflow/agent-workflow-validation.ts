/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-validation
 * 职责：校验 Agent Workflow Definition 的结构完整性，供发布和运行前验收复用。
 * 边界：只做同步 JSON 结构检查，不读取文件、不调用 Host、不访问 APP 层上下文。
 * AI用途：需要判断 definition 是否可发布或可进入 dryRun 链路时，用本模块确认校验规则。
 */

import {
  AGENT_WORKFLOW_DEFINITION_KIND,
  AGENT_WORKFLOW_DEFINITION_SCHEMA,
  AGENT_WORKFLOW_DEFINITION_VERSION,
  AGENT_WORKFLOW_FACTORY_PHASES,
  type AgentWorkflowDefinition,
  type AgentWorkflowDefinitionValidation,
  type AgentWorkflowDefinitionValidationIssue,
  type AgentWorkflowFactoryPhaseDescriptor,
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

export function validateAgentWorkflowDefinition(candidate: unknown): AgentWorkflowDefinitionValidation {
  const issues: AgentWorkflowDefinitionValidationIssue[] = []
  if (!isJsonRecord(candidate)) {
    return createAgentWorkflowDefinitionValidation([errorIssue(
      'AGENT_WORKFLOW_DEFINITION_NOT_OBJECT',
      'Agent workflow definition must be a JSON object.',
      'definition',
    )])
  }

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

  const factory = expectObject({ record: candidate, field: 'factory', path: 'definition.factory', issues })
  if (factory !== undefined) {
    for (const descriptor of AGENT_WORKFLOW_FACTORY_PHASES) {
      validateFactorySection(factory, descriptor, issues)
    }
  }

  const spark = expectObject({ record: candidate, field: 'x_spark', path: 'definition.x_spark', issues })
  if (spark !== undefined) {
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

function validateFactorySection(
  factory: Readonly<Record<string, unknown>>,
  descriptor: AgentWorkflowFactoryPhaseDescriptor,
  issues: AgentWorkflowDefinitionValidationIssue[],
): void {
  const section = expectObject({
    record: factory,
    field: descriptor.phase,
    path: `definition.factory.${descriptor.phase}`,
    issues,
  })
  if (section === undefined) return

  expectString({
    record: section,
    field: 'phaseId',
    expected: descriptor.phaseId,
    path: `definition.factory.${descriptor.phase}.phaseId`,
    issues,
  })
  expectString({
    record: section,
    field: 'phase',
    expected: descriptor.phase,
    path: `definition.factory.${descriptor.phase}.phase`,
    issues,
  })
  expectString({
    record: section,
    field: 'sectionPath',
    expected: descriptor.sectionPath,
    path: `definition.factory.${descriptor.phase}.sectionPath`,
    issues,
  })
  expectString({
    record: section,
    field: 'publishPath',
    expected: descriptor.publishPath,
    path: `definition.factory.${descriptor.phase}.publishPath`,
    issues,
  })
  expectObject({
    record: section,
    field: 'value',
    path: `definition.factory.${descriptor.phase}.value`,
    issues,
  })
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
): AgentWorkflowDefinitionValidationIssue {
  return {
    severity: 'error',
    code,
    message,
    path,
  }
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
