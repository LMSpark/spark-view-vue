/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-dry-run
 * 职责：作为运行时适配器消费 AgentWorkflowDefinition 中的绑定引用，执行 Host 激活和 dryRun 验收链。
 * 边界：不改变 definition 的工艺说明书定位；只调用 Host.ensure/dryRun，不启动 LLM turn，不执行工具，不处理 APP delivery。
 * AI用途：需要验证运行时是否能消费 workflow 工艺说明书中的 registration binding 时，用本模块确认链路。
 */

import type { AiJsonParams } from '../../json'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
} from '../business/ai-host'
import type { AiAgentRegistration } from '../business/registration-types'
import type { AgentWorkflowDefinition } from './agent-workflow-definition'
import { assertAgentWorkflowDefinition } from './agent-workflow-validation'

export type AgentWorkflowActivation = Readonly<{
  alias: string
  moduleId: string
  registrationBindingKey: string
  rootClassName?: string
}>

export type AgentWorkflowRegistrationBinding<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  moduleId: string
  create: () => AiAgentRegistration<TInput>
}>

export type AgentWorkflowBindings<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  registrations: Readonly<Record<string, AgentWorkflowRegistrationBinding<TInput>>>
}>

export type ActivateAgentWorkflowDefinitionCommand<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  host: AiAgentHost
  definition: AgentWorkflowDefinition
  bindings: AgentWorkflowBindings<TInput>
}>

export type AgentWorkflowDryRunCommand<TInput extends AiJsonParams = AiJsonParams> =
  ActivateAgentWorkflowDefinitionCommand<TInput> & Readonly<{
    input: TInput
  }>

export type AgentWorkflowDryRunResult = Readonly<{
  host: AiAgentHost
  activation: AgentWorkflowActivation
  dryRun: AiAgentHostDryRunResult
}>

export function resolveAgentWorkflowActivation(definition: AgentWorkflowDefinition): AgentWorkflowActivation {
  assertAgentWorkflowDefinition(definition)
  const identity = definition.factory.identity.value
  const activation = definition.factory.activation.value
  const alias = readRequiredText(identity, 'alias', 'factory.identity.value.alias')
  const moduleId = readRequiredText(identity, 'moduleId', 'factory.identity.value.moduleId')
  const registrationBindingKey = readOptionalText(activation, 'registrationBindingKey')
    ?? readOptionalText(activation, 'bindingKey')
    ?? alias
  const rootClassName = readOptionalText(identity, 'rootClassName')

  return {
    alias,
    moduleId,
    registrationBindingKey,
    ...(rootClassName === undefined ? {} : { rootClassName }),
  }
}

export function activateAgentWorkflowDefinition<TInput extends AiJsonParams>(
  command: ActivateAgentWorkflowDefinitionCommand<TInput>,
): AiAgentHost {
  const activation = resolveAgentWorkflowActivation(command.definition)
  const binding = command.bindings.registrations[activation.registrationBindingKey]
  if (binding === undefined) {
    throw new Error(`Agent workflow registration binding not found: ${activation.registrationBindingKey}`)
  }
  if (binding.moduleId !== activation.moduleId) {
    throw new Error(
      `Agent workflow binding moduleId mismatch: expected "${activation.moduleId}", got "${binding.moduleId}".`,
    )
  }

  return command.host.ensure(activation.alias, {
    moduleId: activation.moduleId,
    create: binding.create,
  })
}

export function dryRunAgentWorkflowDefinition<TInput extends AiJsonParams>(
  command: AgentWorkflowDryRunCommand<TInput>,
): AgentWorkflowDryRunResult {
  const activation = resolveAgentWorkflowActivation(command.definition)
  const host = activateAgentWorkflowDefinition(command)
  return {
    host,
    activation,
    dryRun: host.dryRun(activation.alias, command.input),
  }
}

function readRequiredText(
  record: Readonly<Record<string, unknown>>,
  field: string,
  path: string,
): string {
  const value = readOptionalText(record, field)
  if (value === undefined) {
    throw new Error(`Agent workflow activation requires ${path}.`)
  }
  return value
}

function readOptionalText(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = record[field]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}
