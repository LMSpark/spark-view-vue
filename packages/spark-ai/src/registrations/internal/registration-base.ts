import {
  AiModuleRegistrationBase,
  type AiFunctionRegistration,
  type AiModuleInstanceParam,
  type AiModuleRegistration,
  type AiRuntimeExecuteFunctionCallOptions,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeFunctionCallTranslationResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeMessageRole,
  type AiRuntimeMessageSource,
  type AiRuntimeOptions,
  type AiRuntimeSessionRecord,
  type AiRuntimeStartSessionResult,
  type AiRuntimeStopSessionResult,
  type ModulePromptProvider,
} from '../../core/protocol/runtime-contracts'
import { AiRuntime } from '../../core/internal/runtime/ai-runtime'
import type { AiRegisteredModule } from '../../core/internal/runtime/ai-registered-module'
import type { AiKnowledgeProjection } from '../../core/internal/knowledge/knowledge-projection'

export type StaticAiToolModuleOptions = {
  readonly moduleId: string
  readonly name: string
  readonly description: string
  readonly prompt?: ModulePromptProvider | undefined
  readonly functionRegistrations?: readonly AiFunctionRegistration[] | undefined
  readonly modules?: readonly AiModuleRegistration[] | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
}

export abstract class StaticAiToolModule extends AiModuleRegistrationBase {
  private readonly functionRegistrations: readonly AiFunctionRegistration[]

  protected constructor(options: StaticAiToolModuleOptions) {
    super(
      options.moduleId,
      options.name,
      options.description,
      options.prompt,
      options.modules ?? [],
      options.instanceParam,
    )
    this.functionRegistrations = options.functionRegistrations ?? []
  }

  override getFunctions(): readonly AiFunctionRegistration[] {
    return this.functionRegistrations
  }
}

export type RuntimeBackedModuleContext = {
  readonly instanceId: string
  readonly moduleId: string
  readonly moduleInstanceId: string
}

export type RuntimeBackedAppendMessageOptions = RuntimeBackedModuleContext & {
  readonly role: AiRuntimeMessageRole
  readonly content: string
  readonly source?: AiRuntimeMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export type RuntimeBackedStopSessionOptions = RuntimeBackedModuleContext & {
  readonly reason?: string | undefined
}

export type RuntimeBackedExecuteFunctionCallOptions = RuntimeBackedModuleContext & {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export type RuntimeBackedBusinessModuleOptions = StaticAiToolModuleOptions & {
  readonly runtime?: AiRuntime | undefined
  readonly runtimeOptions?: AiRuntimeOptions | undefined
}

export abstract class RuntimeBackedBusinessModule extends StaticAiToolModule {
  protected readonly core: AiRuntime

  protected readonly ai: AiRegisteredModule

  protected constructor(options: RuntimeBackedBusinessModuleOptions) {
    super(options)
    this.core = options.runtime ?? new AiRuntime(options.runtimeOptions ?? {})
    this.ai = this.core.registerModule(this)
  }

  protected assertRuntimeContext(context: RuntimeBackedModuleContext): void {
    if (context.moduleId !== this.moduleId) {
      throw new Error(`${this.moduleId} context moduleId must be ${this.moduleId}, got ${context.moduleId}`)
    }
  }

  getRuntimeKnowledgeProjection(): AiKnowledgeProjection {
    return this.core.getKnowledgeProjection()
  }

  async projectKnowledge(context: RuntimeBackedModuleContext): Promise<AiRuntimeKnowledgeProjection> {
    this.assertRuntimeContext(context)
    return this.ai.projectKnowledge({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  async startSession(context: RuntimeBackedModuleContext): Promise<AiRuntimeStartSessionResult> {
    this.assertRuntimeContext(context)
    return this.ai.startSession({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  stopSession(options: RuntimeBackedStopSessionOptions): AiRuntimeStopSessionResult {
    this.assertRuntimeContext(options)
    return this.ai.stopSession({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
  }

  appendMessage(options: RuntimeBackedAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    this.assertRuntimeContext(options)
    return this.ai.appendMessage({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      role: options.role,
      content: options.content,
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })
  }

  getSession(context: RuntimeBackedModuleContext): AiRuntimeSessionRecord | null {
    this.assertRuntimeContext(context)
    return this.ai.getSession(context.moduleInstanceId)
  }

  listSessions(): readonly AiRuntimeSessionRecord[] {
    return this.ai.listSessions()
  }

  getSessionHistory(context: RuntimeBackedModuleContext): readonly AiRuntimeHistoryEntry[] {
    this.assertRuntimeContext(context)
    return this.ai.getSessionHistory(context.moduleInstanceId)
  }

  async translateFunctionCall(
    options: RuntimeBackedExecuteFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallTranslationResult> {
    this.assertRuntimeContext(options)
    return this.ai.translateFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
    })
  }

  protected executeRegisteredFunctionCall(
    options: RuntimeBackedExecuteFunctionCallOptions & Pick<
      AiRuntimeExecuteFunctionCallOptions,
      'validate' | 'run' | 'normalizeResult' | 'errorFix'
    >,
  ): Promise<AiRuntimeFunctionCallResult<unknown>> {
    this.assertRuntimeContext(options)
    return this.ai.executeFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
      validate: options.validate,
      run: options.run,
      normalizeResult: options.normalizeResult,
      ...(options.errorFix === undefined ? {} : { errorFix: options.errorFix }),
    })
  }

  abstract executeFunctionCall(
    options: RuntimeBackedExecuteFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallResult<unknown>>

  releaseModuleInstance(_moduleInstanceId: string): void {}
}
