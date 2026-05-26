import {
  LlmSchemaValidator,
  coerceStrictJsonValue,
  type LlmJsonSchemaObject,
  type LlmJsonValue,
} from '../../schema'
import type { ModuleSemanticRuntime } from '../../module-semantic/runtime/module-semantic-runtime'
import type { AiHostChatMessage, AiHostChatRequest } from '../chat/chat-types'
import type { AiHostSessionStore } from '../session/session-types'
import type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
} from './lifecycle-types'
import { AiHostBusinessRegistration } from './registration-types'
import { AiHostBusinessTarget, type AiHostBusinessRuntimeContext, type AiHostBusinessScope } from './scope-types'

export type AiHostBusinessTaskInput = Readonly<Record<string, LlmJsonValue>>

export type AiHostBusinessOrchestrationPlan = Readonly<{
  userMessage: string
  systemPrompt: string
  title?: string
  readonlySteps?: readonly string[]
}>

export type AiHostBusinessInputContract = Readonly<{
  paramsSchema: LlmJsonSchemaObject
  identityField: string
  normalize: (input: AiHostBusinessTaskInput) => AiHostBusinessTaskInput
  toScope: (normalizedInput: AiHostBusinessTaskInput) => AiHostBusinessScope
  toOrchestration: (normalizedInput: AiHostBusinessTaskInput) => AiHostBusinessOrchestrationPlan
}>

export type AiHostBusinessKindDefinition = Readonly<{
  kindID: string
  name: string
  description: string
  runtime: ModuleSemanticRuntime
  inputContract: AiHostBusinessInputContract
  sessionStore?: AiHostSessionStore
  systemPrompt?: (context: AiHostBusinessRuntimeContext) => string | undefined
  afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  releaseModuleInstance?: (moduleInstanceId: string) => void
}>

export type AiHostBusinessTaskChatOptions = Omit<AiHostChatRequest, 'historyMsgs' | 'systemPrompt'> & Readonly<{
  systemPrompt?: string
}>

export type AiHostBusinessTaskRegistry = Readonly<{
  get(kindID: string): AiHostBusinessRegistration | undefined
}>

export class AiHostBusinessTask {
  public readonly target: AiHostBusinessTarget

  public constructor(
    public readonly kindID: string,
    public readonly normalizedInput: AiHostBusinessTaskInput,
    public readonly scope: AiHostBusinessScope,
    public readonly orchestration: AiHostBusinessOrchestrationPlan,
  ) {
    this.target = new AiHostBusinessTarget(scope.businessRegistrationId, scope.businessInstanceId)
  }

  public toChatRequest(options: AiHostBusinessTaskChatOptions = {}): AiHostChatRequest {
    const { systemPrompt: extraSystemPrompt, ...requestOptions } = options
    const systemPrompt = [
      createRegisteredTaskSystemPrompt(this),
      this.orchestration.systemPrompt,
      extraSystemPrompt,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')
    const historyMsgs: readonly AiHostChatMessage[] = [
      { role: 'user', content: this.orchestration.userMessage },
    ]
    return {
      ...requestOptions,
      historyMsgs,
      ...(systemPrompt.trim().length === 0 ? {} : { systemPrompt }),
    }
  }
}

export function projectAiHostBusinessRegistration(
  definition: AiHostBusinessKindDefinition,
): AiHostBusinessRegistration {
  return new AiHostBusinessRegistration({
    moduleId: normalizeRequiredText(definition.kindID, 'kindID'),
    name: definition.name,
    description: definition.description,
    runtime: definition.runtime,
    inputContract: definition.inputContract,
    ...(definition.sessionStore === undefined ? {} : { sessionStore: definition.sessionStore }),
    ...(definition.systemPrompt === undefined ? {} : { systemPrompt: definition.systemPrompt }),
    ...(definition.afterFunctionCall === undefined ? {} : { afterFunctionCall: definition.afterFunctionCall }),
    ...(definition.onStartSession === undefined ? {} : { onStartSession: definition.onStartSession }),
    ...(definition.onEndBusinessInstance === undefined ? {} : { onEndBusinessInstance: definition.onEndBusinessInstance }),
    ...(definition.releaseModuleInstance === undefined ? {} : { releaseModuleInstance: definition.releaseModuleInstance }),
  })
}

export function createAiHostBusinessTask(
  registry: AiHostBusinessTaskRegistry,
  kindID: string,
  input: unknown,
): AiHostBusinessTask {
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
  const normalizedInput = coerceInputRecord(contract.normalize(rawInput), `${normalizedKindID} normalized input`)
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
  return new AiHostBusinessTask(normalizedKindID, normalizedInput, scope, orchestration)
}

function createRegisteredTaskSystemPrompt(task: AiHostBusinessTask): string {
  const promptInput = createRegisteredTaskPromptInput(task)
  return [
    `kindID=${task.kindID}; businessInstanceId=${task.target.businessInstanceId}; input=${JSON.stringify(promptInput)}。`,
  ].join('\n')
}

function createRegisteredTaskPromptInput(task: AiHostBusinessTask): AiHostBusinessTaskInput {
  const userMessage = task.orchestration.userMessage.trim()
  const out: Record<string, LlmJsonValue> = {}
  for (const [key, value] of Object.entries(task.normalizedInput)) {
    if (typeof value === 'string' && value.trim() === userMessage) continue
    out[key] = value
  }
  return out
}

function validateTaskInput(
  kindID: string,
  schema: LlmJsonSchemaObject,
  input: AiHostBusinessTaskInput,
): void {
  const validation = LlmSchemaValidator.validateLlmDeserializedParams(input, schema)
  if (!validation.ok) {
    throw new Error(
      `AI host business task input for "${kindID}" failed schema validation: ${LlmSchemaValidator.formatLlmParamValidationIssues(validation.issues)}`,
    )
  }
}

function readIdentityValue(
  kindID: string,
  contract: Pick<AiHostBusinessInputContract, 'identityField'>,
  normalizedInput: AiHostBusinessTaskInput,
): string {
  const identityField = normalizeRequiredText(contract.identityField, 'identityField')
  const identity = normalizedInput[identityField]
  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new Error(`AI host business task input for "${kindID}" must include non-empty identity field "${identityField}".`)
  }
  return identity.trim()
}

function assertScopeMatchesInput(kindID: string, scope: AiHostBusinessScope, identity: string): void {
  if (scope.businessRegistrationId !== kindID) {
    throw new Error(`AI host business task scope kindID mismatch: expected "${kindID}", got "${scope.businessRegistrationId}".`)
  }
  if (scope.businessInstanceId !== identity) {
    throw new Error(`AI host business task scope identity mismatch: expected "${identity}", got "${scope.businessInstanceId}".`)
  }
}

function coerceInputRecord(input: unknown, label: string): AiHostBusinessTaskInput {
  if (!isPlainRecord(input)) {
    throw new Error(`AI host business task ${label} must be a JSON object.`)
  }
  const out: Record<string, LlmJsonValue> = {}
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
    throw new Error(`[AiHostBusinessTask] ${fieldName} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`[AiHostBusinessTask] ${fieldName} must not be empty.`)
  }
  return trimmed
}
