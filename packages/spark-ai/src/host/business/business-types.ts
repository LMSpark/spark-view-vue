/**
 * AI Host business registration and scope objects.
 */

import type { ModuleSemanticRuntime } from '../../module-semantic/runtime/module-semantic-runtime'
import type { LlmJsonValue } from '../../schema'
import type { AiHostChatRequest } from '../chat/chat-types'
import type {
  AiHostFunctionCallResult,
  AiHostMessageRole,
  AiHostMessageSource,
  AiHostSessionStore,
} from '../session/session-types'
import type { AiHostTransport } from '../transport/transport-types'

export class AiHostBusinessTarget {
  public constructor(
    public readonly businessRegistrationId: string,
    public readonly businessInstanceId: string,
  ) {}
}

export class AiHostBusinessScope extends AiHostBusinessTarget {
  public constructor(
    businessRegistrationId: string,
    businessInstanceId: string,
    public readonly instanceId: string,
    public readonly runtimeInstanceId: string,
  ) {
    super(businessRegistrationId, businessInstanceId)
  }
}

export class AiHostBusinessRuntimeContext {
  public constructor(
    public readonly moduleId: string,
    public readonly moduleInstanceId: string,
    public readonly instanceId: string,
  ) {}
}

export type AiHostBusinessAppendMessageOptions = AiHostBusinessRuntimeContext & Readonly<{
  role: AiHostMessageRole
  content: string
  source?: AiHostMessageSource | undefined
  metadata?: Record<string, unknown> | undefined
}>

export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

export type AiHostBusinessLifecycleDirective = Readonly<{
  status: AiHostBusinessLifecycleStatus
  reason?: string | undefined
  finalAssistantMessage?: string | undefined
  releaseInstance?: boolean | undefined
}>

export type AiHostBusinessAfterFunctionCallOptions = AiHostBusinessRuntimeContext & Readonly<{
  toolName: string
  args: Readonly<Record<string, LlmJsonValue>>
  result: AiHostFunctionCallResult<unknown>
}>

export type AiHostBusinessRegistrationOptions = Readonly<{
  moduleId: string
  name: string
  description: string
  runtime: ModuleSemanticRuntime
  sessionStore?: AiHostSessionStore | undefined
  systemPrompt?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined
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

export class AiHostBusinessRegistration {
  public readonly moduleId: string
  public readonly name: string
  public readonly description: string
  public readonly runtime: ModuleSemanticRuntime
  public readonly sessionStore?: AiHostSessionStore | undefined
  public readonly systemPrompt?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined
  public readonly afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  public readonly onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  public readonly onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  public readonly releaseModuleInstance?: (moduleInstanceId: string) => void

  public constructor(options: AiHostBusinessRegistrationOptions) {
    this.moduleId = options.moduleId
    this.name = options.name
    this.description = options.description
    this.runtime = options.runtime
    if (options.sessionStore !== undefined) this.sessionStore = options.sessionStore
    if (options.systemPrompt !== undefined) this.systemPrompt = options.systemPrompt
    if (options.afterFunctionCall !== undefined) this.afterFunctionCall = options.afterFunctionCall
    if (options.onStartSession !== undefined) this.onStartSession = options.onStartSession
    if (options.onEndBusinessInstance !== undefined) this.onEndBusinessInstance = options.onEndBusinessInstance
    if (options.releaseModuleInstance !== undefined) this.releaseModuleInstance = options.releaseModuleInstance
  }
}

export type AiHostOptions = Readonly<{
  registry: {
    get(moduleId: string): AiHostBusinessRegistration | undefined
    list(): readonly AiHostBusinessRegistration[]
  }
  transport: AiHostTransport
  maxToolRounds?: number | undefined
}>

export type AiHostSender = (request: AiHostChatRequest) => Promise<void>
