/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-definition
 * 职责：定义可序列化 Agent Workflow Definition 契约，把业务工厂 F0-F9 阶段沉淀为稳定 JSON 结构。
 * 边界：只描述 workflow 定义，不持有函数、class、实例、APP delivery port 或 UI 状态。
 * AI用途：需要判断业务工厂 workflow definition 字段、阶段映射或发布产物格式时，用本模块确认契约。
 */

import type {
  BusinessFactoryWorkflowPhaseId,
  BusinessFactoryWorkflowPhaseKind,
} from '../business/business-factory'

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
  phaseId?: BusinessFactoryWorkflowPhaseId
  publishPath?: string
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

export type AgentWorkflowFactoryPhaseDescriptor = Readonly<{
  phaseId: BusinessFactoryWorkflowPhaseId
  phase: BusinessFactoryWorkflowPhaseKind
  sectionPath: string
  publishPath: string
}>

export type AgentWorkflowFactorySection<
  TPhaseId extends BusinessFactoryWorkflowPhaseId = BusinessFactoryWorkflowPhaseId,
  TPhaseKind extends BusinessFactoryWorkflowPhaseKind = BusinessFactoryWorkflowPhaseKind,
> = Readonly<{
  phaseId: TPhaseId
  phase: TPhaseKind
  sectionPath: string
  publishPath: string
  nodeId?: string
  scopePath?: string
  value: AgentWorkflowJsonRecord
}>

export type AgentWorkflowFactorySections = Readonly<{
  identity: AgentWorkflowFactorySection<'F0', 'identity'>
  materials: AgentWorkflowFactorySection<'F1', 'materials'>
  knowledge: AgentWorkflowFactorySection<'F2', 'knowledge'>
  contract: AgentWorkflowFactorySection<'F3', 'contract'>
  runtime: AgentWorkflowFactorySection<'F4', 'runtime'>
  governance: AgentWorkflowFactorySection<'F5', 'governance'>
  acceptance: AgentWorkflowFactorySection<'F6', 'acceptance'>
  activation: AgentWorkflowFactorySection<'F7', 'activation'>
  workOrder: AgentWorkflowFactorySection<'F8', 'workOrder'>
  delivery: AgentWorkflowFactorySection<'F9', 'delivery'>
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
  factory: AgentWorkflowFactorySections
  x_spark: AgentWorkflowDefinitionSparkMeta
}>

export const AGENT_WORKFLOW_DEFINITION_KIND: AgentWorkflowDefinitionKind = 'agent.workflow'

export const AGENT_WORKFLOW_DEFINITION_VERSION: AgentWorkflowDefinitionVersion = 1

export const AGENT_WORKFLOW_DEFINITION_SCHEMA: AgentWorkflowDefinitionSchema = 'spark.agent.workflow.definition.v1'

export const AGENT_WORKFLOW_FACTORY_PHASES = Object.freeze([
  { phaseId: 'F0', phase: 'identity', sectionPath: 'factory.identity', publishPath: 'workflow.factory.identity' },
  { phaseId: 'F1', phase: 'materials', sectionPath: 'factory.materials', publishPath: 'workflow.factory.materials' },
  { phaseId: 'F2', phase: 'knowledge', sectionPath: 'factory.knowledge', publishPath: 'workflow.factory.knowledge' },
  { phaseId: 'F3', phase: 'contract', sectionPath: 'factory.contract', publishPath: 'workflow.factory.contract' },
  { phaseId: 'F4', phase: 'runtime', sectionPath: 'factory.runtime', publishPath: 'workflow.factory.runtime' },
  { phaseId: 'F5', phase: 'governance', sectionPath: 'factory.governance', publishPath: 'workflow.factory.governance' },
  { phaseId: 'F6', phase: 'acceptance', sectionPath: 'factory.acceptance', publishPath: 'workflow.factory.acceptance' },
  { phaseId: 'F7', phase: 'activation', sectionPath: 'factory.activation', publishPath: 'workflow.factory.activation' },
  { phaseId: 'F8', phase: 'workOrder', sectionPath: 'factory.workOrder', publishPath: 'workflow.factory.workOrder' },
  { phaseId: 'F9', phase: 'delivery', sectionPath: 'factory.delivery', publishPath: 'workflow.factory.delivery' },
] satisfies readonly AgentWorkflowFactoryPhaseDescriptor[])
