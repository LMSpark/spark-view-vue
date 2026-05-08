import type {
  AiBusinessRegistration,
  AiRuntimeApi,
  AiRuntimeAction,
  AiRuntimeAppendMessagesOptions,
  AiRuntimeEventListener,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallResult,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeHistorySnapshot,
  AiRuntimeInstanceDetail,
  AiRuntimeInstanceSnapshot,
  AiRuntimeOptions,
  AiRuntimeBusinessInstanceScope,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeStopBusinessInstanceOptions,
  FunctionExecutionContext,
} from '../protocol/business-contracts'
import { AiInvocationProtocol } from '../protocol/invocation-helpers'
import {
  AiRuntimeArgValidator,
  AiRuntimeEventHub,
  AiRuntimeHistory,
  type AiRuntimeInstanceState,
  AiRuntimeProjector,
  type AiRuntimeResolvedFunctionCall,
} from './ai-runtime-support'

/**
 * 内存型 AI runtime 编排器。
 *
 * 功能边界：
 * - 拥有 runtime instance、history snapshot、事件分发和函数调用分发。
 * - 不拥有业务服务实例本身；业务服务通过 `registerBusiness` 注入 metadata 与 hook。
 * - 所有函数调用都按 `business@module@function` 解析后路由。
 *
 * 主流程时序：
 * 1. `registerBusiness` 注册业务定义。
 * 2. `startInstance` 为某个 business scope 创建或恢复实例。
 * 3. `appendMessages` 写入 LLM 对话历史。
 * 4. `executeFunctionCall` 校验、执行并记录函数调用。
 * 5. `stopInstance` 或 `stopInstanceByBusinessScope` 暂停/终止实例。
 */
export class AiRuntime implements AiRuntimeApi {
  /** 已注册业务定义，按 registration.businessId 索引。 */
  private readonly businesses = new Map<string, AiBusinessRegistration>()

  /** 当前进程内追踪的 runtime instance，按 runtime 生成 instanceId 索引。 */
  private readonly instances = new Map<string, AiRuntimeInstanceState>()

  /** 业务 scope 到 instanceId 的索引，保证同一 scope 复用同一非终态实例。 */
  private readonly instancesByBusinessInstance = new Map<string, string>()

  /** 实例 ID 生成器，允许测试或宿主应用注入稳定实现。 */
  private readonly createInstanceId: NonNullable<AiRuntimeOptions['createInstanceId']>

  /** 业务投影器：负责生成 promptSnapshot、function exposure 和快照副本。 */
  private readonly projector = new AiRuntimeProjector(AiRuntime.actionOf, AiRuntime.assertId)

  /** 函数执行前的轻量参数校验器。 */
  private readonly argValidator = new AiRuntimeArgValidator()

  /** runtime 事件中心。 */
  private readonly eventHub: AiRuntimeEventHub

  /** runtime 历史写入器。 */
  private readonly history: AiRuntimeHistory

  /** 注入 ID/时钟依赖并初始化内部支持组件。 */
  constructor(options: AiRuntimeOptions = {}) {
    this.createInstanceId = options.createInstanceId ?? AiRuntime.defaultInstanceId
    const createRecordId = options.createRecordId ?? AiRuntime.createDefaultRecordId
    const now = options.now ?? Date.now
    this.eventHub = new AiRuntimeEventHub(createRecordId, now)
    this.history = new AiRuntimeHistory(createRecordId, now, this.eventHub, this.projector)
  }

  /**
   * 注册业务定义，并校验所有暴露 action 唯一。
   *
   * @throws 业务 ID 重复、module/function ID 非法或完整 action 冲突时抛出。
   */
  registerBusiness(registration: AiBusinessRegistration): void {
    this.projector.assertUniqueActions(registration)
    if (this.businesses.has(registration.businessId)) {
      throw new Error(`Duplicate AI business registration: ${registration.businessId}`)
    }
    this.businesses.set(registration.businessId, registration)
  }

  /** 按 ID 返回已注册业务定义；不存在时返回 undefined。 */
  getBusinessRegistration(businessId: string): AiBusinessRegistration | undefined {
    return this.businesses.get(businessId)
  }

  /** 按注册顺序列出业务定义。 */
  listBusinessRegistrations(): readonly AiBusinessRegistration[] {
    return Array.from(this.businesses.values())
  }

  /**
   * 为 `{ businessId, businessInstanceId }` 启动或恢复 runtime instance。
   *
   * 时序说明：
   * 1. 确认业务存在且状态 Ready。
   * 2. 若同一业务 scope 已有非终态实例，则进入 Resuming，刷新 prompt/function exposure。
   * 3. 若不存在，则创建新实例、投影业务能力、记录初始 exposure。
   * 4. 最终实例进入 Ready，并返回实例快照与历史快照。
   */
  async startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult> {
    const business = this.getBusinessOrThrow(options.businessId)

    const businessKey = this.makeBusinessInstanceKey(options.businessId, options.businessInstanceId)
    const existingInstanceId = this.instancesByBusinessInstance.get(businessKey)
    if (existingInstanceId !== undefined) {
      const existing = this.getInstanceOrThrow(existingInstanceId)
      if (existing.status === 'Stopped' || existing.status === 'Failed') {
        throw new Error(`Cannot resume terminal runtime instance ${existing.instanceId}: ${existing.status}`)
      }

      this.history.setStatus(existing, 'Resuming')
      this.eventHub.emit(existing, 'instance.resuming', { restoreContext: options.restoreContext })
      await this.refreshInstanceExposure(existing)
      this.history.recordExposure(existing)
      this.history.setStatus(existing, 'Ready')
      this.eventHub.emit(existing, 'instance.ready', this.projector.createInstanceSnapshot(existing))
      return {
        ...this.projector.createInstanceSnapshot(existing),
        history: this.history.createHistorySnapshot(existing),
      }
    }

    const instanceId = this.createUniqueInstanceId(options.businessId, options.businessInstanceId)

    const businessExposure = await this.projector.projectBusiness(business, {
      instanceId,
      businessId: options.businessId,
      businessInstanceId: options.businessInstanceId,
    })

    const instance: AiRuntimeInstanceState = {
      instanceId,
      businessId: options.businessId,
      business: businessExposure,
      businessInstanceId: options.businessInstanceId,
      status: 'Starting',
      promptSnapshot: this.projector.buildPromptSnapshot(businessExposure),
      availableFunctions: this.projector.flattenFunctions(businessExposure),
      history: {
        version: 0,
        messages: [],
        functionCalls: [],
        lifecycleMarkers: [],
        functionExposureSnapshots: [],
      },
      seq: 0,
      pendingPause: false,
      pendingStop: false,
    }

    this.instances.set(instanceId, instance)
    this.instancesByBusinessInstance.set(businessKey, instanceId)
    this.history.setStatus(instance, 'Starting')
    this.eventHub.emit(instance, 'instance.starting', {})
    this.history.recordExposure(instance)
    this.eventHub.emit(instance, 'instance.started', this.projector.createInstanceSnapshot(instance))
    this.history.setStatus(instance, 'Ready')
    this.eventHub.emit(instance, 'instance.ready', this.projector.createInstanceSnapshot(instance))
    return {
      ...this.projector.createInstanceSnapshot(instance),
      history: this.history.createHistorySnapshot(instance),
    }
  }

  /**
   * 通过 runtime 生成 ID 暂停或终止实例。
   *
   * 当实例正在 Executing 时，请求不会打断当前函数：
   * - pause 会设置 pendingPause，函数结束后进入 Paused。
   * - stop 会设置 pendingStop，函数结束后执行 releaseInstance 并进入 Stopped/Failed。
   */
  async stopInstance(options: AiRuntimeStopInstanceOptions): Promise<AiRuntimeStopInstanceResult> {
    const instance = this.getInstanceOrThrow(options.instanceId)
    const business = this.getBusinessOrThrow(instance.businessId)

    if (options.mode === 'pause') {
      if (instance.status === 'Executing') {
        instance.pendingPause = true
      } else if (instance.status !== 'Paused') {
        this.history.setStatus(instance, 'Paused', options.reason)
        this.eventHub.emit(instance, 'instance.paused', { reason: options.reason })
      }
      return {
        instance: this.projector.createInstanceSnapshot(instance),
        history: this.history.createHistorySnapshot(instance),
      }
    }

    if (instance.status === 'Executing') {
      instance.pendingStop = true
      this.history.setStatus(instance, 'Stopping', options.reason)
      this.eventHub.emit(instance, 'instance.stopping', { reason: options.reason })
      return {
        instance: this.projector.createInstanceSnapshot(instance),
        history: this.history.createHistorySnapshot(instance),
      }
    }

    if (instance.status !== 'Stopped' && instance.status !== 'Failed') {
      await this.finishStop(instance, business, options.reason)
    }

    return {
      instance: this.projector.createInstanceSnapshot(instance),
      history: this.history.createHistorySnapshot(instance),
    }
  }

  /** 通过业务 scope 暂停或终止实例；内部先解析为 instanceId 再复用 stopInstance。 */
  async stopInstanceByBusinessScope(options: AiRuntimeStopBusinessInstanceOptions): Promise<AiRuntimeStopInstanceResult> {
    const instance = this.getInstanceByBusinessScopeOrThrow(options)
    const stopOptions: AiRuntimeStopInstanceOptions = {
      instanceId: instance.instanceId,
      mode: options.mode,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    }
    return this.stopInstance(stopOptions)
  }

  /**
   * 向 Ready runtime instance 追加聊天消息。
   *
   * @throws 实例不存在或当前状态不是 Ready 时抛出。
   */
  appendMessages(options: AiRuntimeAppendMessagesOptions): AiRuntimeHistorySnapshot {
    const instance = this.getInstanceOrThrow(options.instanceId)
    if (instance.status !== 'Ready') {
      throw new Error(`appendMessages requires Ready runtime instance ${options.instanceId}; current status is ${instance.status}`)
    }
    return this.history.appendMessages(instance, options)
  }

  /**
   * 返回 runtime instance 当前暴露的函数。
   *
   * 返回值经过 clone，调用方无法修改 runtime 内部状态。
   */
  getAvailableFunctions(instanceId: string): readonly AiRuntimeFunctionExposure[] {
    return this.projector.cloneExposure(this.getInstanceOrThrow(instanceId).availableFunctions)
  }

  /**
   * 校验、分发、记录并返回一次函数调用结果。
   *
   * 失败处理时序：
   * 1. action/instance/business/module/function 解析失败时返回结构化失败。
   * 2. paramsSchema 或业务 validate 失败时记录失败调用。
   * 3. execute 抛错会归一化为 EXECUTE_ERROR。
   * 4. 执行后刷新函数暴露，处理 pending stop/pause，再返回最新历史快照。
   */
  async executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeExecuteFunctionCallResult> {
    const resolved = this.resolveFunctionCall(options)
    if ('ok' in resolved) {
      const instance = this.instances.get(options.instanceId)
      return {
        result: resolved,
        history: instance ? this.history.createHistorySnapshot(instance) : AiRuntime.createEmptyHistorySnapshot(options.instanceId),
      }
    }

    const { instance, business, definition, exposure } = resolved
    const validationError = this.argValidator.validateArgsBySchema(definition.paramsSchema, options.args)
    if (validationError !== null) {
      const result = AiRuntime.createFailure('INVALID_ARGS', validationError, `Use paramsSchema from getAvailableFunctions for ${options.action}.`)
      this.history.recordFunctionCall(instance, options.action, options.args, result)
      return { result, history: this.history.createHistorySnapshot(instance) }
    }

    const executionAction = AiRuntime.actionOf(instance.businessId, exposure.moduleId, exposure.functionId)
    const executionContext: FunctionExecutionContext = {
      instanceId: instance.instanceId,
      businessId: business.businessId,
      businessInstanceId: instance.businessInstanceId,
      moduleId: exposure.moduleId,
      functionId: exposure.functionId,
      action: executionAction,
    }

    let customValidationError: string | null
    try {
      customValidationError = definition.validate?.(options.args, executionContext) ?? null
    } catch (error) {
      const result = AiRuntime.createFailure(
        'VALIDATE_ERROR',
        AiInvocationProtocol.toErrorMessage(error),
        `Fix ${options.action} validator or retry with arguments that satisfy the business rule.`,
      )
      this.history.recordFunctionCall(instance, options.action, options.args, result)
      return { result, history: this.history.createHistorySnapshot(instance) }
    }
    if (customValidationError !== null) {
      const result = AiRuntime.createFailure('INVALID_ARGS', customValidationError, `Fix args for ${options.action} before retrying.`)
      this.history.recordFunctionCall(instance, options.action, options.args, result)
      return { result, history: this.history.createHistorySnapshot(instance) }
    }

    this.history.setStatus(instance, 'Executing')
    this.eventHub.emit(instance, 'function.before', { action: options.action, args: options.args }, {
      moduleId: exposure.moduleId,
      functionId: exposure.functionId,
    })

    let result: AiRuntimeFunctionCallResult<unknown>
    try {
      const executed = await definition.execute(options.args, executionContext)
      if (AiRuntime.isFunctionCallResult(executed)) {
        result = executed
      } else {
        const warnings = definition.postValidate?.(options.args, executed, executionContext) ?? []
        result = {
          ok: true,
          data: executed,
          summary: `${options.action} executed`,
          ...(warnings.length > 0 ? { warnings } : {}),
        }
      }
    } catch (error) {
      result = AiRuntime.createFailure(
        'EXECUTE_ERROR',
        AiInvocationProtocol.toErrorMessage(error),
        `Fix ${options.action} implementation or retry with valid args after checking business service state.`,
      )
    }

    this.history.recordFunctionCall(instance, options.action, options.args, result)
    this.eventHub.emit(instance, result.ok ? 'function.succeeded' : 'function.failed', { action: options.action, result }, {
      moduleId: exposure.moduleId,
      functionId: exposure.functionId,
    })
    try {
      await this.refreshInstanceExposure(instance)
      this.history.recordExposure(instance)
    } catch (error) {
      const message = AiInvocationProtocol.toErrorMessage(error)
      this.history.setStatus(instance, 'Failed', message)
      this.eventHub.emit(instance, 'instance.failed', {
        reason: 'refreshInstanceExposure',
        error: message,
      })
      return { result, history: this.history.createHistorySnapshot(instance) }
    }

    if (instance.pendingStop) {
      instance.pendingStop = false
      await this.finishStop(instance, business, 'pendingStop')
    } else if (instance.pendingPause) {
      instance.pendingPause = false
      this.history.setStatus(instance, 'Paused', 'pendingPause')
      this.eventHub.emit(instance, 'instance.paused', { reason: 'pendingPause' })
    } else {
      this.history.setStatus(instance, 'Ready')
      this.eventHub.emit(instance, 'instance.ready', this.projector.createInstanceSnapshot(instance))
    }

    return { result, history: this.history.createHistorySnapshot(instance) }
  }

  /** 列出当前内存中追踪的所有 runtime instance。 */
  listInstances(): readonly AiRuntimeInstanceSnapshot[] {
    return Array.from(this.instances.values()).map((instance) => this.projector.createInstanceSnapshot(instance))
  }

  /** 返回完整实例详情；未知 instanceId 返回 null。 */
  getInstanceDetail(instanceId: string): AiRuntimeInstanceDetail | null {
    const instance = this.instances.get(instanceId)
    return instance ? this.projector.createInstanceDetail(instance) : null
  }

  /** 返回实例历史；未知 instanceId 返回 null。 */
  getInstanceHistory(instanceId: string): AiRuntimeHistorySnapshot | null {
    const instance = this.instances.get(instanceId)
    return instance ? this.history.createHistorySnapshot(instance) : null
  }

  /** 通过业务 scope 查询实例快照。 */
  getInstanceByBusinessScope(scope: AiRuntimeBusinessInstanceScope): AiRuntimeInstanceSnapshot | null {
    const instance = this.resolveInstanceByScope(scope)
    return instance ? this.projector.createInstanceSnapshot(instance) : null
  }

  /** 通过业务 scope 查询实例历史。 */
  getInstanceHistoryByBusinessScope(scope: AiRuntimeBusinessInstanceScope): AiRuntimeHistorySnapshot | null {
    const instance = this.resolveInstanceByScope(scope)
    return instance ? this.history.createHistorySnapshot(instance) : null
  }

  /** 订阅 runtime 事件，并返回取消订阅函数。 */
  subscribe(listener: AiRuntimeEventListener): () => void {
    return this.eventHub.subscribe(listener)
  }

  /** 强制获取实例；未知 instanceId 属于调用错误，直接抛出。 */
  private getInstanceOrThrow(instanceId: string): AiRuntimeInstanceState {
    const instance = this.instances.get(instanceId)
    if (instance === undefined) {
      throw new Error(`Unknown AI runtime instance: ${instanceId}`)
    }
    return instance
  }

  /** 强制获取业务注册；未知 businessId 属于配置或调用错误，直接抛出。 */
  private getBusinessOrThrow(businessId: string): AiBusinessRegistration {
    const business = this.businesses.get(businessId)
    if (business === undefined) {
      throw new Error(`Unknown AI business registration: ${businessId}`)
    }
    return business
  }

  /** 检查实例是否 Ready；函数调用只允许在 Ready 状态进入。 */
  private assertReady(instance: AiRuntimeInstanceState, action: AiRuntimeAction): AiRuntimeFunctionCallResult | null {
    if (instance.status === 'Ready') return null
    return AiRuntime.createFailure(
      'INSTANCE_NOT_READY',
      `${action} requires runtime instance ${instance.instanceId} to be Ready, current status is ${instance.status}`,
      'Call startInstance to create or resume a Ready LLM runtime instance before invoking business functions.',
    )
  }

  /** 同业务服务的函数调用必须携带 businessInstanceId（实例发现动作除外）。 */
  private assertBusinessInstanceArg(
    instance: AiRuntimeInstanceState,
    business: AiBusinessRegistration,
    action: AiRuntimeAction,
    args: unknown,
  ): AiRuntimeFunctionCallResult | null {
    const discoveryAction = business.instanceQueryAction === undefined
      ? null
      : `${business.businessId}@${business.instanceQueryAction}`
    if (discoveryAction !== null && action === discoveryAction) {
      return null
    }

    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return AiRuntime.createFailure(
        'INVALID_ARGS',
        `${action} requires args.businessInstanceId for business ${business.businessId}.`,
        'Pass businessInstanceId in args. You can call the configured instance query action first to obtain it.',
      )
    }

    const candidate = (args as Record<string, unknown>).businessInstanceId
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      return AiRuntime.createFailure(
        'INVALID_ARGS',
        `${action} requires a non-empty args.businessInstanceId for business ${business.businessId}.`,
        'Pass businessInstanceId in args. You can call the configured instance query action first to obtain it.',
      )
    }

    if (candidate !== instance.businessInstanceId) {
      return AiRuntime.createFailure(
        'INVALID_ARGS',
        `${action} received args.businessInstanceId=${candidate}, but runtime instance ${instance.instanceId} is bound to ${instance.businessInstanceId}.`,
        'Use the same businessInstanceId as the bound runtime instance, or start/resume the target businessInstanceId first.',
      )
    }

    return null
  }

  /**
   * 解析一次函数调用。
   *
   * 解析顺序刻意从便宜到昂贵：
   * action 格式 -> instance 存在与状态 -> business 匹配与健康 -> module -> exposure -> definition。
   */
  private resolveFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): AiRuntimeResolvedFunctionCall | AiRuntimeFunctionCallResult {
    let address: ReturnType<typeof AiInvocationProtocol.parseActionAddress>
    try {
      address = AiInvocationProtocol.parseActionAddress(options.action)
    } catch (error) {
      return AiRuntime.createFailure('INVALID_ACTION', AiInvocationProtocol.toErrorMessage(error), 'Use action format business@module@function.')
    }

    const instance = this.instances.get(options.instanceId)
    if (instance === undefined) {
      return AiRuntime.createFailure(
        'UNKNOWN_INSTANCE',
        `Unknown AI runtime instance: ${options.instanceId}`,
        'Call startInstance before executeFunctionCall and pass its instanceId envelope field.',
      )
    }

    const readyFailure = this.assertReady(instance, options.action)
    if (readyFailure !== null) return readyFailure

    if (address.business !== instance.businessId) {
      return AiRuntime.createFailure(
        'BUSINESS_MISMATCH',
        `Action ${options.action} targets business ${address.business}, but runtime instance ${instance.instanceId} is bound to ${instance.businessId}.`,
        'Use an action from getAvailableFunctions for the same instanceId.',
      )
    }

    const business = this.getBusinessOrThrow(instance.businessId)
    const businessInstanceArgFailure = this.assertBusinessInstanceArg(instance, business, options.action, options.args)
    if (businessInstanceArgFailure !== null) return businessInstanceArgFailure

    const module = business.modules.find((candidate) => candidate.moduleId === address.module)
    if (module === undefined) {
      return AiRuntime.createFailure(
        'MODULE_NOT_AVAILABLE',
        `Module ${address.module} is not registered for business ${business.businessId}.`,
        'Use a module exposed by the current business registration.',
      )
    }

    const exposure = instance.availableFunctions.find((candidate) => candidate.action === options.action)
    if (exposure === undefined) {
      return AiRuntime.createFailure(
        'FUNCTION_NOT_AVAILABLE',
        `Function ${options.action} is not available for runtime instance ${instance.instanceId}.`,
        'Call getAvailableFunctions and choose one of the exposed actions for this instance.',
      )
    }

    const definition = module.getFunctions().find((candidate) => candidate.functionId === address.function)
    if (definition === undefined) {
      return AiRuntime.createFailure(
        'FUNCTION_DEFINITION_MISSING',
        `Function definition ${options.action} is missing from module ${address.module}.`,
        'Fix the business registration so registered functions and exposed actions stay aligned.',
      )
    }

    return { instance, business, definition, exposure }
  }

  /** 刷新实例的业务投影、promptSnapshot 和可调用函数列表。 */
  private async refreshInstanceExposure(instance: AiRuntimeInstanceState): Promise<void> {
    await this.projector.refreshInstanceExposure(instance, this.getBusinessOrThrow(instance.businessId))
  }

  /** 完成终止流程：调用业务 releaseInstance，并记录 Stopped 或 Failed。 */
  private async finishStop(
    instance: AiRuntimeInstanceState,
    business: AiBusinessRegistration,
    reason: string | undefined,
  ): Promise<void> {
    if (instance.status !== 'Stopping') {
      this.history.setStatus(instance, 'Stopping', reason)
      this.eventHub.emit(instance, 'instance.stopping', { reason })
    }

    try {
      await business.releaseInstance?.({
        instanceId: instance.instanceId,
        businessId: instance.businessId,
        businessInstanceId: instance.businessInstanceId,
      })
      this.history.setStatus(instance, 'Stopped', reason)
      this.eventHub.emit(instance, 'instance.stopped', { reason })
    } catch (error) {
      const message = AiInvocationProtocol.toErrorMessage(error)
      this.history.setStatus(instance, 'Failed', message)
      this.eventHub.emit(instance, 'instance.failed', { reason: 'releaseInstance', error: message })
    }
  }

  /** 默认 runtime instance ID，包含 business scope、时间和随机后缀。 */
  private static defaultInstanceId(businessId: string, businessInstanceId: string): string {
    return `${businessId}-${businessInstanceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** 默认历史/事件记录 ID，按记录类型加时间和随机后缀生成。 */
  private static createDefaultRecordId(kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure'): string {
    return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** 校验 ID 非空且不包含 action 分隔符 @。 */
  private static assertId(kind: string, value: string): void {
    if (value.trim().length === 0) {
      throw new Error(`${kind} must not be empty`)
    }
    if (value.includes('@')) {
      throw new Error(`${kind} must not contain @: ${value}`)
    }
  }

  /** 组装完整 action 地址。 */
  private static actionOf<
    TBusinessId extends string,
    TModuleId extends string,
    TFunctionId extends string,
  >(businessId: TBusinessId, moduleId: TModuleId, functionId: TFunctionId): AiRuntimeAction<TBusinessId, TModuleId, TFunctionId> {
    return `${businessId}@${moduleId}@${functionId}`
  }

  /** 创建结构化失败结果，统一 code/msg/fix 形状。 */
  private static createFailure(code: string, msg: string, fix: string): AiRuntimeFunctionCallResult {
    return { ok: false, code, msg, fix }
  }

  /** 判断业务实现返回值是否已经是结构化函数调用结果。 */
  private static isFunctionCallResult(value: unknown): value is AiRuntimeFunctionCallResult<unknown> {
    if (typeof value !== 'object' || value === null || !('ok' in value)) return false
    const candidate = value as Partial<AiRuntimeFunctionCallResult<unknown>>
    if (candidate.ok === true) {
      return 'data' in candidate && typeof candidate.summary === 'string'
    }
    if (candidate.ok === false) {
      return typeof candidate.code === 'string'
        && typeof candidate.msg === 'string'
        && typeof candidate.fix === 'string'
    }
    return false
  }

  /** 当 instance 不存在但需要返回 history envelope 时，创建空历史快照。 */
  private static createEmptyHistorySnapshot(instanceId: string): AiRuntimeHistorySnapshot {
    return {
      instanceId,
      businessId: '',
      businessInstanceId: '',
      version: 0,
      messages: [],
      functionCalls: [],
      lifecycleMarkers: [],
      functionExposureSnapshots: [],
    }
  }

  /** 业务 scope 索引键，避免和用户传入 ID 的字符空间混淆。 */
  private makeBusinessInstanceKey(businessId: string, businessInstanceId: string): string {
    return `${businessId}::${businessInstanceId}`
  }

  /** 通过业务 scope 解析实例；索引缺失或实例被清理时返回 null。 */
  private resolveInstanceByScope(scope: AiRuntimeBusinessInstanceScope): AiRuntimeInstanceState | null {
    const instanceId = this.instancesByBusinessInstance.get(this.makeBusinessInstanceKey(scope.businessId, scope.businessInstanceId))
    if (instanceId === undefined) return null
    return this.instances.get(instanceId) ?? null
  }

  /** 通过业务 scope 强制获取实例。 */
  private getInstanceByBusinessScopeOrThrow(scope: AiRuntimeBusinessInstanceScope): AiRuntimeInstanceState {
    const instance = this.resolveInstanceByScope(scope)
    if (instance === null) {
      throw new Error(`Unknown AI runtime instance for business ${scope.businessId} + ${scope.businessInstanceId}`)
    }
    return instance
  }

  /** 生成唯一 instanceId；若注入生成器产生冲突，则追加递增后缀。 */
  private createUniqueInstanceId(businessId: string, businessInstanceId: string): string {
    const base = this.createInstanceId(businessId, businessInstanceId)
    if (!this.instances.has(base)) return base
    let counter = 1
    while (this.instances.has(`${base}-${counter}`)) counter += 1
    return `${base}-${counter}`
  }
}
