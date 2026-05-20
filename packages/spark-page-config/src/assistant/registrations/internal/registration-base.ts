/**
 * 业务注册基类。
 *
 * 定义两条主路径：
 * 1. StaticAiToolModule — 纯静态工具模块，仅提供函数注册表，不依赖 AI Runtime。
 * 2. RuntimeBackedBusinessModule — 带 Runtime 支持的业务模块，通过 AiRuntime 管理会话生命周期：
 *    startSession → appendMessage / executeFunctionCall / projectKnowledge → stopSession → releaseModuleInstance
 *
 * 所有具体业务模块（LeaveRequestModule / PageDesignModule）都继承 RuntimeBackedBusinessModule，
 * 通过覆盖 executeFunctionCall 注入各自的 validate / run / normalizeResult 逻辑。
 */

import {
  AiModuleRegistrationBase,
  AiRuntime,
  type AiKnowledgeProjector,
  type AiModuleRegistrationBaseOptions,
  type AiRegisteredModule,
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
} from '@spark-view/spark-ai/protocol'

export type StaticAiToolModuleOptions = AiModuleRegistrationBaseOptions

/** 静态 AI 工具模块基类：持有 moduleId / name / description / prompt 和函数注册表，不依赖 Runtime。 */
export abstract class StaticAiToolModule extends AiModuleRegistrationBase {
  protected constructor(options: StaticAiToolModuleOptions) {
    super(options)
  }
}

export interface RuntimeBackedModuleContext {
  readonly instanceId: string
  readonly moduleId: string
  readonly moduleInstanceId: string
}

export interface RuntimeBackedAppendMessageOptions extends RuntimeBackedModuleContext {
  readonly role: AiRuntimeMessageRole
  readonly content: string
  readonly source?: AiRuntimeMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface RuntimeBackedStopSessionOptions extends RuntimeBackedModuleContext {
  readonly reason?: string | undefined
}

export interface RuntimeBackedExecuteFunctionCallOptions extends RuntimeBackedModuleContext {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export interface RuntimeBackedBusinessModuleOptions extends StaticAiToolModuleOptions {
  readonly runtime?: AiRuntime | undefined
  readonly runtimeOptions?: AiRuntimeOptions | undefined
}

/**
 * 带 Runtime 支持的业务模块基类。
 *
 * 构造函数中自动创建 AiRuntime 并注册自身（this.core.registerModule(this)），
 * 子类通过覆盖 executeFunctionCall 实现具体业务逻辑，通过继承 startSession / stopSession
 * 管理会话生命周期。releaseModuleInstance 在会话结束时清理草稿/页面状态。
 */
export abstract class RuntimeBackedBusinessModule extends StaticAiToolModule {
  protected readonly core: AiRuntime

  protected readonly ai: AiRegisteredModule

  protected constructor(options: RuntimeBackedBusinessModuleOptions) {
    super(options)
    this.core = options.runtime ?? new AiRuntime(options.runtimeOptions ?? {})
    this.ai = this.core.registerModule(this)
  }

  /** 校验上下文 moduleId 是否与当前模块匹配，防止跨模块调用。 */
  protected assertRuntimeContext(context: RuntimeBackedModuleContext): void {
    if (context.moduleId !== this.moduleId) {
      throw new Error(`${this.moduleId} context moduleId must be ${this.moduleId}, got ${context.moduleId}`)
    }
  }

  /** 获取当前 Runtime 的知识投影器，用于查询函数目录和模块知识。 */
  getRuntimeKnowledgeProjection(): AiKnowledgeProjector {
    return this.core.getKnowledgeProjection()
  }

  /** 投影当前模块知识给 LLM，用于 tool schema 展示。 */
  async projectKnowledge(context: RuntimeBackedModuleContext): Promise<AiRuntimeKnowledgeProjection> {
    this.assertRuntimeContext(context)
    return this.ai.projectKnowledge({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  /** 启动 AI 会话，绑定 instanceId / moduleInstanceId / runtimeInstanceId 三元组。 */
  async startSession(context: RuntimeBackedModuleContext): Promise<AiRuntimeStartSessionResult> {
    this.assertRuntimeContext(context)
    return this.ai.startSession({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  /** 停止 AI 会话，可选传入 reason 标记结束原因。 */
  stopSession(options: RuntimeBackedStopSessionOptions): AiRuntimeStopSessionResult {
    this.assertRuntimeContext(options)
    return this.ai.stopSession({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
  }

  /** 将用户/助手消息追加到当前会话历史。 */
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

  /** 获取当前业务实例的会话记录，无会话时返回 null。 */
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

  /** 将 LLM 的函数调用意图翻译为可执行的动作，包含参数校验和结果格式化。 */
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

  /** 内部委托方法：注入 validate / run / normalizeResult / errorFix 后执行注册函数。子类通过覆盖 executeFunctionCall 注入业务逻辑。 */
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

  /** 子类必须实现的函数调用入口：在此注入 validate / run / normalizeResult / errorFix。 */
  abstract executeFunctionCall(
    options: RuntimeBackedExecuteFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallResult<unknown>>

  /** 会话结束时释放模块实例状态（如草稿、页面绑定），默认空实现。 */
  releaseModuleInstance(_moduleInstanceId: string): void {}
}
