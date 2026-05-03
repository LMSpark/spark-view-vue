import type { JsonSchema } from './json-schema'

export type AiScenarioScope = 'planning' | 'design' | 'business'
export type AiConfirmPolicy = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'
export type AiRecoveryPolicy = 'layered' | 'manual' | 'strict'

export interface AiScenarioIdentity {
  id: string
  title: string
  scope: AiScenarioScope
}

export interface AiScenarioPromptPolicy {
  systemPrompt: string | ((ctx: AiScenarioContext) => string)
  confirmPolicy?: AiConfirmPolicy
  recoveryPolicy?: AiRecoveryPolicy
}

export interface AiScenarioContext {
  userInput: string
  pageId?: string
  projectId?: string
  moduleId?: string
  route?: string
  user?: { id?: string; name?: string; role?: string }
  metadata?: Record<string, unknown>
}

export type AiScenarioCapabilityKind = 'intent' | 'payload' | 'tool' | 'flow' | 'completion' | 'recovery'

export interface AiScenarioCapability {
  id: string
  title: string
  kind: AiScenarioCapabilityKind
  description: string
  tags?: readonly string[]
  relatedTools?: readonly string[]
  requiredPayloadKeys?: readonly string[]
}

export type AiScenarioPayloadSlotSource = 'user' | 'context' | 'tool' | 'system'

export interface AiScenarioPayloadSlot {
  key: string
  label?: string
  description: string
  required?: boolean
  source?: AiScenarioPayloadSlotSource
  schema?: JsonSchema['properties'][string]
  askWhenMissing?: string
  examples?: readonly unknown[]
}

export interface AiScenarioPayloadContract {
  description?: string
  schema?: JsonSchema
  slots?: readonly AiScenarioPayloadSlot[]
  required?: readonly string[]
  examples?: ReadonlyArray<Record<string, unknown>>
}

export type AiScenarioFlowStepKind = 'query' | 'tool' | 'decision' | 'confirm' | 'completion'

export interface AiScenarioFlowStep {
  id: string
  title: string
  kind?: AiScenarioFlowStepKind
  description?: string
  tool?: string
  tools?: readonly string[]
  args?: unknown
  requiredPayloadKeys?: readonly string[]
  dependsOn?: readonly string[]
  critical?: boolean
}

export interface AiScenarioFlowContract {
  description?: string
  steps: readonly AiScenarioFlowStep[]
}

export interface AiScenarioCompletionContract {
  description?: string
  tools?: readonly string[]
  successSignals?: readonly string[]
  failureSignals?: readonly string[]
}

export interface AiScenarioRecoveryHint {
  code?: string
  when: string
  hint: string
  tools?: readonly string[]
}

export interface AiScenarioToolCall {
  tool: string
  args?: unknown
}

export interface AiScenarioToolRegistration {
  category?: string
  tags?: readonly string[]
  example?: Record<string, unknown>
  rules?: readonly string[]
  failureCodes?: readonly string[]
  fixHints?: readonly string[]
}

export interface AiScenarioTool {
  name: string
  description: string
  parameters?: JsonSchema
  registration?: AiScenarioToolRegistration
  execute: (args: unknown, ctx: AiScenarioContext) => unknown
}

export interface AiScenarioStep {
  id: string
  title: string
  tool: string
  args?: unknown
  critical?: boolean
}

export interface AiScenarioIntentMatch {
  matched: boolean
  score: number
  reason?: string
}

export interface AiScenarioDefinition extends AiScenarioIdentity {
  description?: string
  intents: readonly string[]
  promptPolicy: AiScenarioPromptPolicy
  capabilities?: readonly AiScenarioCapability[]
  payload?: AiScenarioPayloadContract
  flow?: AiScenarioFlowContract
  completion?: AiScenarioCompletionContract
  recovery?: readonly AiScenarioRecoveryHint[]
  tools: readonly AiScenarioTool[]
  buildPayload?: (ctx: AiScenarioContext) => unknown
  buildSteps?: (payload: unknown, ctx: AiScenarioContext) => readonly AiScenarioStep[]
  matchIntent?: (input: string, ctx: AiScenarioContext) => AiScenarioIntentMatch
}

export interface AiScenarioResolution {
  scenario: AiScenarioDefinition
  score: number
  reason?: string
}

export interface AiScenarioRunRequest {
  scenarioId?: string
  userInput: string
  context?: Omit<AiScenarioContext, 'userInput'>
  payload?: unknown
  toolCalls?: readonly AiScenarioToolCall[]
  dryRun?: boolean
}

export interface AiScenarioToolExecution {
  tool: string
  args: unknown
  ok: boolean
  result?: unknown
  error?: string
}

export interface AiScenarioRunResult {
  scenario: AiScenarioIdentity
  systemPrompt: string
  payload: unknown
  steps: readonly AiScenarioStep[]
  executions: readonly AiScenarioToolExecution[]
  status: 'planned' | 'completed' | 'failed'
}
