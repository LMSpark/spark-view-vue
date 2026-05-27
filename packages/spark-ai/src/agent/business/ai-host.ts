import { defineCapability, isCallable, isRecord } from '@spark-view/spark-utils'
import type { AiJsonParams } from '../../json'
import { AiAgentRegistry } from './business-registry'
import { runAiAgent, type AiAgentSession } from './business-session'
import type { AiAgentTask, AiAgentTaskChatOptions } from './business-task'
import type { AiAgentTurnCallbacks } from '../transport/transport-types'
import type { AiAgentRegistration } from './registration-types'
import type { AiAgentOptions } from './host-options'

export type CreateAiAgentHostOptions = Readonly<{
  turnCallbacks: AiAgentTurnCallbacks
  maxToolRounds?: number
}>

export type AiAgentHostRunResult = Readonly<{
  task: AiAgentTask
  session: AiAgentSession
}>

export type AiAgentHostEntryMap = Record<string, AiAgentRegistration>

export type AiAgentHostRegistrationInput<TRegistration> =
  TRegistration extends AiAgentRegistration<infer TInput> ? TInput : AiJsonParams

export type AiAgentHostEnsureCommand<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  moduleId: string
  create: () => AiAgentRegistration<TInput>
}>

type AiAgentHostState = {
  readonly registry: AiAgentRegistry
  readonly aliasToModuleId: Map<string, string>
  readonly moduleIdToAlias: Map<string, string>
  readonly turnCallbacks: AiAgentTurnCallbacks
  readonly maxToolRounds?: number
}

export class AiAgentHost<TEntries extends AiAgentHostEntryMap = {}> {
  private readonly state: AiAgentHostState

  private constructor(state: AiAgentHostState) {
    this.state = state
  }

  public static create(options: CreateAiAgentHostOptions): AiAgentHost {
    return new AiAgentHost(createAiAgentHostState(options))
  }

  public register<K extends string, TInput extends AiJsonParams>(
    alias: K,
    registration: AiAgentRegistration<TInput>,
  ): AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    if (this.state.aliasToModuleId.has(normalizedAlias)) {
      throw new Error(`Duplicate AI host run alias: ${normalizedAlias}`)
    }
    this.state.registry.register(registration)
    this.state.aliasToModuleId.set(normalizedAlias, registration.moduleId)
    this.state.moduleIdToAlias.set(registration.moduleId, normalizedAlias)

    return new AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>>(this.state)
  }

  public ensure<K extends string, TInput extends AiJsonParams>(
    alias: K,
    command: AiAgentHostEnsureCommand<TInput>,
  ): AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = normalizeRequiredText(command.moduleId, 'moduleId')
    const existingModuleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (existingModuleId !== undefined) {
      if (existingModuleId !== moduleId) {
        throw new Error(`AI host run alias "${normalizedAlias}" is already bound to moduleId "${existingModuleId}", not "${moduleId}".`)
      }
      return new AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>>(this.state)
    }

    const existingAlias = this.state.moduleIdToAlias.get(moduleId)
    if (existingAlias !== undefined) {
      throw new Error(`AI host business moduleId "${moduleId}" is already bound to alias "${existingAlias}".`)
    }
    if (this.state.registry.get(moduleId) !== undefined) {
      throw new Error(`AI host business moduleId "${moduleId}" is already registered without alias "${normalizedAlias}".`)
    }

    const registration = command.create()
    if (registration.moduleId !== moduleId) {
      throw new Error(`AI agent ensure moduleId mismatch: expected "${moduleId}", got "${registration.moduleId}".`)
    }
    return this.register(alias, registration)
  }

  public has(alias: string): boolean {
    return this.state.aliasToModuleId.has(normalizeAlias(alias))
  }

  public async run<TInput extends AiJsonParams = AiJsonParams>(
    alias: string,
    args: TInput,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) {
      throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
    }
    return runAiAgent({
      options: this.createRunOptions(),
      kindID: moduleId,
      input: args,
      ...(chat === undefined ? {} : { chat }),
    })
  }

  private createRunOptions(): AiAgentOptions {
    const options: AiAgentOptions = {
      registry: this.state.registry,
      turnCallbacks: this.state.turnCallbacks,
    }
    if (this.state.maxToolRounds !== undefined) {
      return { ...options, maxToolRounds: this.state.maxToolRounds }
    }
    return options
  }
}

export const AI_AGENT_HOST = defineCapability<AiAgentHost>('spark:capability:ai-agent-host', isAiAgentHost)

export function createAiAgentHost(options: CreateAiAgentHostOptions): AiAgentHost {
  return AiAgentHost.create(options)
}

function createAiAgentHostState(options: CreateAiAgentHostOptions): AiAgentHostState {
  const state: AiAgentHostState = {
    registry: new AiAgentRegistry(),
    aliasToModuleId: new Map<string, string>(),
    moduleIdToAlias: new Map<string, string>(),
    turnCallbacks: options.turnCallbacks,
  }
  if (options.maxToolRounds !== undefined) {
    return { ...state, maxToolRounds: options.maxToolRounds }
  }
  return state
}

function isAiAgentHost(value: unknown): value is AiAgentHost {
  if (!isRecord(value)) return false
  return isCallable(value['register'])
    && isCallable(value['ensure'])
    && isCallable(value['has'])
    && isCallable(value['run'])
}

function normalizeAlias(value: string): string {
  const normalized = normalizeRequiredText(value, 'alias')
  if (normalized !== value) {
    throw new Error('AI host alias must not include surrounding whitespace.')
  }
  return normalized
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`AI host ${fieldName} must not be empty.`)
  }
  return trimmed
}
