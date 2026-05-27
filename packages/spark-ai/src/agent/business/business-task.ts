import {
  AiJsonSchemaValidator,
  coerceStrictJsonValue,
  type AiJsonParams,
  type AiJsonSchemaObject,
  type AiJsonValue,
} from '../../json'
import type { AiModuleRuntime } from '../../modules/runtime/module-semantic-runtime'
import type { AiAgentChatMessage, AiAgentChatRequest } from '../chat/chat-types'
import type { AiAgentSessionStore } from '../session/session-types'
import type {
  AiAgentAfterFunctionCallOptions,
  AiAgentLifecycleDirective,
} from './lifecycle-types'
import { AiAgentRegistration } from './registration-types'
import { AiAgentTarget, type AiAgentRuntimeContext, type AiAgentScope } from './scope-types'

type AiAgentTaskInput = Readonly<Record<string, AiJsonValue>>

export type AiAgentOrchestrationPlan = Readonly<{
  userMessage: string
  systemPrompt: string
  title?: string
  readonlySteps?: readonly string[]
}>

export type AiAgentInputContract<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  paramsSchema: AiJsonSchemaObject
  identityField: keyof TInput & string
  normalize(input: AiJsonParams): TInput
  toScope(normalizedInput: TInput): AiAgentScope
  toOrchestration(normalizedInput: TInput): AiAgentOrchestrationPlan
}>

export type AiAgentDefinition<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  kindID: string
  name: string
  description: string
  runtime: AiModuleRuntime
  inputContract: AiAgentInputContract<TInput>
  sessionStore: AiAgentSessionStore
  systemPrompt?: (context: AiAgentRuntimeContext) => string | undefined
  afterFunctionCall?: (
    options: AiAgentAfterFunctionCallOptions,
  ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  onStartSession?: (context: AiAgentRuntimeContext) => void | Promise<void>
  onEndBusinessInstance?: (
    context: AiAgentRuntimeContext,
    directive: AiAgentLifecycleDirective,
  ) => void | Promise<void>
  releaseModuleInstance?: (moduleInstanceId: string) => void
}>

export type AiAgentTaskChatOptions = Omit<AiAgentChatRequest, 'historyMsgs' | 'systemPrompt'> & Readonly<{
  systemPrompt?: string
}>

type AiAgentTaskRegistry<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  get(kindID: string): AiAgentRegistration<TInput> | undefined
}>

export class AiAgentTask<TInput extends AiJsonParams = AiJsonParams> {
  public readonly target: AiAgentTarget

  public constructor(
    public readonly kindID: string,
    public readonly normalizedInput: TInput,
    public readonly scope: AiAgentScope,
    public readonly orchestration: AiAgentOrchestrationPlan,
  ) {
    this.target = new AiAgentTarget(scope.businessRegistrationId, scope.businessInstanceId)
  }

  public toChatRequest(options: AiAgentTaskChatOptions = {}): AiAgentChatRequest {
    const { systemPrompt: extraSystemPrompt, ...requestOptions } = options
    const systemPrompt = [
      createRegisteredTaskSystemPrompt(this),
      this.orchestration.systemPrompt,
      extraSystemPrompt,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')
    const historyMsgs: readonly AiAgentChatMessage[] = [
      { role: 'user', content: this.orchestration.userMessage },
    ]
    return {
      ...requestOptions,
      historyMsgs,
      ...(systemPrompt.trim().length === 0 ? {} : { systemPrompt }),
    }
  }
}

export function createAiAgentRegistration<TInput extends AiJsonParams = AiJsonParams>(
  definition: AiAgentDefinition<TInput>,
): AiAgentRegistration<TInput> {
  return new AiAgentRegistration({
    moduleId: normalizeRequiredText(definition.kindID, 'kindID'),
    name: definition.name,
    description: definition.description,
    runtime: definition.runtime,
    inputContract: definition.inputContract,
    sessionStore: definition.sessionStore,
    ...(definition.systemPrompt === undefined ? {} : { systemPrompt: definition.systemPrompt }),
    ...(definition.afterFunctionCall === undefined ? {} : { afterFunctionCall: definition.afterFunctionCall }),
    ...(definition.onStartSession === undefined ? {} : { onStartSession: definition.onStartSession }),
    ...(definition.onEndBusinessInstance === undefined ? {} : { onEndBusinessInstance: definition.onEndBusinessInstance }),
    ...(definition.releaseModuleInstance === undefined ? {} : { releaseModuleInstance: definition.releaseModuleInstance }),
  })
}

export function createAiAgentTask<TInput extends AiJsonParams = AiJsonParams>(
  registry: AiAgentTaskRegistry<TInput>,
  kindID: string,
  input: unknown,
): AiAgentTask<TInput> {
  const normalizedKindID = normalizeRequiredText(kindID, 'kindID')
  const registration = registry.get(normalizedKindID)
  if (registration === undefined) {
    throw new Error(`AI host business kindID is not registered: ${normalizedKindID}`)
  }
  const contract = registration.inputContract
  if (contract === undefined) {
    throw new Error(`AI host business registration missing inputContract: ${normalizedKindID}`)
  }

  const rawInput = coerceInputRecord(input, `${normalizedKindID} input`)
  validateTaskInput(normalizedKindID, contract.paramsSchema, rawInput)
  const normalizedInput = contract.normalize(rawInput)
  validateTaskInput(normalizedKindID, contract.paramsSchema, normalizedInput)

  const identity = readIdentityValue(normalizedKindID, contract, normalizedInput)
  const scope = contract.toScope(normalizedInput)
  assertScopeMatchesInput(normalizedKindID, scope, identity)

  const orchestration = contract.toOrchestration(normalizedInput)
  if (orchestration.userMessage.trim().length === 0) {
    throw new Error(`AI host business task for "${normalizedKindID}" produced an empty userMessage.`)
  }
  if (orchestration.systemPrompt.trim().length === 0) {
    throw new Error(`AI host business task for "${normalizedKindID}" produced an empty orchestration systemPrompt.`)
  }
  return new AiAgentTask(normalizedKindID, normalizedInput, scope, orchestration)
}

function createRegisteredTaskSystemPrompt(task: AiAgentTask): string {
  const promptInput = createRegisteredTaskPromptInput(task)
  return [
    `kindID=${task.kindID}; businessInstanceId=${task.target.businessInstanceId}; input=${JSON.stringify(promptInput)}。`,
  ].join('\n')
}

function createRegisteredTaskPromptInput(task: AiAgentTask): AiAgentTaskInput {
  const userMessage = task.orchestration.userMessage.trim()
  const out: Record<string, AiJsonValue> = {}
  for (const [key, value] of Object.entries(task.normalizedInput)) {
    if (typeof value === 'string' && value.trim() === userMessage) continue
    out[key] = value
  }
  return out
}

function validateTaskInput(
  kindID: string,
  schema: AiJsonSchemaObject,
  input: AiAgentTaskInput,
): void {
  const validation = AiJsonSchemaValidator.validateDeserializedParams(input, schema)
  if (!validation.ok) {
    throw new Error(
      `AI host business task input for "${kindID}" failed schema validation: ${AiJsonSchemaValidator.formatAiJsonValidationIssues(validation.issues)}`,
    )
  }
}

function readIdentityValue(
  kindID: string,
  contract: Pick<AiAgentInputContract, 'identityField'>,
  normalizedInput: AiAgentTaskInput,
): string {
  const identityField = normalizeRequiredText(contract.identityField, 'identityField')
  const identity = normalizedInput[identityField]
  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new Error(`AI host business task input for "${kindID}" must include non-empty identity field "${identityField}".`)
  }
  return identity.trim()
}

function assertScopeMatchesInput(kindID: string, scope: AiAgentScope, identity: string): void {
  if (scope.businessRegistrationId !== kindID) {
    throw new Error(`AI host business task scope kindID mismatch: expected "${kindID}", got "${scope.businessRegistrationId}".`)
  }
  if (scope.businessInstanceId !== identity) {
    throw new Error(`AI host business task scope identity mismatch: expected "${identity}", got "${scope.businessInstanceId}".`)
  }
}

function coerceInputRecord(input: unknown, label: string): AiAgentTaskInput {
  if (!isPlainRecord(input)) {
    throw new Error(`AI host business task ${label} must be a JSON object.`)
  }
  const out: Record<string, AiJsonValue> = {}
  for (const [key, value] of Object.entries(input)) {
    const coerced = coerceStrictJsonValue(value)
    if (coerced === undefined) {
      throw new Error(`AI host business task ${label}.${key} must be JSON-serializable.`)
    }
    out[key] = coerced
  }
  return out
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Reflect.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiAgentTask] ${fieldName} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`[AiAgentTask] ${fieldName} must not be empty.`)
  }
  return trimmed
}
