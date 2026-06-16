/**
 * @module @spark-appworks/spark-ai:agent/workflow
 * 职责：汇总 Agent Workflow definition、校验和 dryRun 激活链公共 API。
 * 边界：只导出 workflow 子域稳定契约，不导入 APP 层或具体业务实现。
 * AI用途：应用层需要引用 workflow definition 或激活 helper 时，从本模块确认公共出口。
 */

export {
  AGENT_WORKFLOW_DEFINITION_KIND,
  AGENT_WORKFLOW_DEFINITION_SCHEMA,
  AGENT_WORKFLOW_DEFINITION_VERSION,
  AGENT_WORKFLOW_FACTORY_PHASES,
} from './agent-workflow-definition'

export {
  assertAgentWorkflowDefinition,
  createAgentWorkflowDefinitionValidation,
  validateAgentWorkflowDefinition,
} from './agent-workflow-validation'

export {
  activateAgentWorkflowDefinition,
  dryRunAgentWorkflowDefinition,
  resolveAgentWorkflowActivation,
} from './agent-workflow-dry-run'

export type {
  AgentWorkflowDefinition,
  AgentWorkflowDefinitionKind,
  AgentWorkflowDefinitionSchema,
  AgentWorkflowDefinitionSource,
  AgentWorkflowDefinitionSparkMeta,
  AgentWorkflowDefinitionValidation,
  AgentWorkflowDefinitionValidationIssue,
  AgentWorkflowDefinitionValidationSeverity,
  AgentWorkflowDefinitionValidationStatus,
  AgentWorkflowDefinitionVersion,
  AgentWorkflowFactoryPhaseDescriptor,
  AgentWorkflowFactorySection,
  AgentWorkflowFactorySections,
  AgentWorkflowJsonRecord,
} from './agent-workflow-definition'

export type {
  ActivateAgentWorkflowDefinitionCommand,
  AgentWorkflowActivation,
  AgentWorkflowBindings,
  AgentWorkflowDryRunCommand,
  AgentWorkflowDryRunResult,
  AgentWorkflowRegistrationBinding,
} from './agent-workflow-dry-run'
