import { defineCapability, isCallable, isRecord } from '@spark-view/spark-utils'
import type { LlmJsonParams } from '../../schema'
import { AiHostBusinessRegistry } from './business-registry'
import { runAiHostBusiness, type AiHostBusinessSession } from './business-session'
import type { AiHostBusinessTask, AiHostBusinessTaskChatOptions } from './business-task'
import type { AiHostTurnCallbacks } from '../transport/transport-types'
import type { AiHostBusinessRegistration } from './registration-types'
import type { AiHostOptions } from './host-options'

export type CreateAiHostOptions = Readonly<{
  turnCallbacks: AiHostTurnCallbacks
  maxToolRounds?: number
}>

export type AiHostRunResult = Readonly<{
  task: AiHostBusinessTask
  session: AiHostBusinessSession
}>

export type AiHostRunFunction<TInput extends LlmJsonParams = LlmJsonParams> = (
  args: TInput,
  chat?: AiHostBusinessTaskChatOptions,
) => Promise<AiHostRunResult>

export type AiHostEntryMap = Record<string, AiHostBusinessRegistration>

export type AiHostRegistrationInput<TRegistration> =
  TRegistration extends AiHostBusinessRegistration<infer TInput> ? TInput : LlmJsonParams

export type AiHostRunMap<TEntries extends AiHostEntryMap> = Readonly<
  Record<string, AiHostDynamicRunFunction>
  & { [K in Extract<keyof TEntries, string>]: AiHostRunFunction<AiHostRegistrationInput<TEntries[K]>> }
>

export type AiHostEnsureRegCommand<TInput extends LlmJsonParams = LlmJsonParams> = Readonly<{
  moduleId: string
  create: () => AiHostBusinessRegistration<TInput>
}>

type AiHostDynamicRunFunction = (
  args: LlmJsonParams,
  chat?: AiHostBusinessTaskChatOptions,
) => Promise<AiHostRunResult>

type AiHostState = {
  readonly registry: AiHostBusinessRegistry
  readonly aliasToModuleId: Map<string, string>
  readonly moduleIdToAlias: Map<string, string>
  readonly turnCallbacks: AiHostTurnCallbacks
  readonly maxToolRounds?: number
}

export class AiHost<TEntries extends AiHostEntryMap = {}> {
  public readonly run: AiHostRunMap<TEntries>

  private readonly state: AiHostState

  private constructor(state: AiHostState, run: AiHostRunMap<TEntries>) {
    this.state = state
    this.run = run
  }

  public static create(options: CreateAiHostOptions): AiHost {
    return new AiHost(createAiHostState(options), createEmptyRunMap())
  }

  public reg<K extends string, TInput extends LlmJsonParams>(
    alias: K,
    registration: AiHostBusinessRegistration<TInput>,
  ): AiHost<TEntries & Record<K, AiHostBusinessRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    if (this.state.aliasToModuleId.has(normalizedAlias)) {
      throw new Error(`Duplicate AI host run alias: ${normalizedAlias}`)
    }
    this.state.registry.register(registration)
    this.state.aliasToModuleId.set(normalizedAlias, registration.moduleId)
    this.state.moduleIdToAlias.set(registration.moduleId, normalizedAlias)

    const nextRun = Object.assign(
      this.run,
      createRunEntry(normalizedAlias, (args: TInput, chat?: AiHostBusinessTaskChatOptions) =>
        this.runByAlias(normalizedAlias, args, chat)),
    )
    return new AiHost<TEntries & Record<K, AiHostBusinessRegistration<TInput>>>(this.state, nextRun)
  }

  public ensureReg<K extends string, TInput extends LlmJsonParams>(
    alias: K,
    command: AiHostEnsureRegCommand<TInput>,
  ): AiHost<TEntries & Record<K, AiHostBusinessRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = normalizeRequiredText(command.moduleId, 'moduleId')
    const existingModuleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (existingModuleId !== undefined) {
      if (existingModuleId !== moduleId) {
        throw new Error(`AI host run alias "${normalizedAlias}" is already bound to moduleId "${existingModuleId}", not "${moduleId}".`)
      }
      const nextRun = Object.assign(
        this.run,
        createRunEntry(normalizedAlias, (args: TInput, chat?: AiHostBusinessTaskChatOptions) =>
          this.runByAlias(normalizedAlias, args, chat)),
      )
      return new AiHost<TEntries & Record<K, AiHostBusinessRegistration<TInput>>>(this.state, nextRun)
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
      throw new Error(`AI host ensureReg moduleId mismatch: expected "${moduleId}", got "${registration.moduleId}".`)
    }
    return this.reg(alias, registration)
  }

  public has(alias: string): boolean {
    return this.state.aliasToModuleId.has(normalizeAlias(alias))
  }

  public async runByAlias(
    alias: string,
    args: LlmJsonParams,
    chat?: AiHostBusinessTaskChatOptions,
  ): Promise<AiHostRunResult> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) {
      throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
    }
    return runAiHostBusiness({
      options: this.createRunOptions(),
      kindID: moduleId,
      input: args,
      ...(chat === undefined ? {} : { chat }),
    })
  }

  private createRunOptions(): AiHostOptions {
    const options: AiHostOptions = {
      registry: this.state.registry,
      turnCallbacks: this.state.turnCallbacks,
    }
    if (this.state.maxToolRounds !== undefined) {
      return { ...options, maxToolRounds: this.state.maxToolRounds }
    }
    return options
  }
}

export const AI_HOST = defineCapability<AiHost>('spark:capability:ai-host', isAiHost)

export function createAiHost(options: CreateAiHostOptions): AiHost {
  return AiHost.create(options)
}

function createAiHostState(options: CreateAiHostOptions): AiHostState {
  const state: AiHostState = {
    registry: new AiHostBusinessRegistry(),
    aliasToModuleId: new Map<string, string>(),
    moduleIdToAlias: new Map<string, string>(),
    turnCallbacks: options.turnCallbacks,
  }
  if (options.maxToolRounds !== undefined) {
    return { ...state, maxToolRounds: options.maxToolRounds }
  }
  return state
}

function createEmptyRunMap(): AiHostRunMap<{}> {
  return Object.fromEntries<AiHostDynamicRunFunction>([])
}

function createRunEntry<TInput extends LlmJsonParams>(
  alias: string,
  run: AiHostRunFunction<TInput>,
) {
  return Object.fromEntries([[alias, run]])
}

function isAiHost(value: unknown): value is AiHost {
  if (!isRecord(value)) return false
  return isCallable(value['reg'])
    && isCallable(value['ensureReg'])
    && isCallable(value['has'])
    && isCallable(value['runByAlias'])
    && isRecord(value['run'])
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
