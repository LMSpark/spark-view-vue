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
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
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

export class AiRuntime implements AiRuntimeApi {
  private readonly businesses = new Map<string, AiBusinessRegistration>()

  private readonly instances = new Map<string, AiRuntimeInstanceState>()

  private readonly instancesByBusinessInstance = new Map<string, string>()

  private readonly createInstanceId: NonNullable<AiRuntimeOptions['createInstanceId']>

  private readonly projector = new AiRuntimeProjector(AiRuntime.actionOf, AiRuntime.assertId)

  private readonly argValidator = new AiRuntimeArgValidator()

  private readonly eventHub: AiRuntimeEventHub

  private readonly history: AiRuntimeHistory

  constructor(options: AiRuntimeOptions = {}) {
    this.createInstanceId = options.createInstanceId ?? AiRuntime.defaultInstanceId
    const createRecordId = options.createRecordId ?? AiRuntime.createDefaultRecordId
    const now = options.now ?? Date.now
    this.eventHub = new AiRuntimeEventHub(createRecordId, now)
    this.history = new AiRuntimeHistory(createRecordId, now, this.eventHub, this.projector)
  }

  registerBusiness(registration: AiBusinessRegistration): void {
    this.projector.assertUniqueActions(registration)
    if (this.businesses.has(registration.businessId)) {
      throw new Error(`Duplicate AI business registration: ${registration.businessId}`)
    }
    this.businesses.set(registration.businessId, registration)
  }

  getBusinessRegistration(businessId: string): AiBusinessRegistration | undefined {
    return this.businesses.get(businessId)
  }

  listBusinessRegistrations(): readonly AiBusinessRegistration[] {
    return Array.from(this.businesses.values())
  }

  async startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult> {
    const business = this.getBusinessOrThrow(options.businessId)
    const businessFailure = this.assertBusinessReady(business)
    if (businessFailure !== null && !businessFailure.ok) {
      throw new Error(businessFailure.msg)
    }

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

    const instanceId = this.createInstanceId(options.businessId, options.businessInstanceId)
    if (this.instances.has(instanceId)) {
      throw new Error(`Duplicate AI core instanceId: ${instanceId}`)
    }

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

  appendMessages(options: AiRuntimeAppendMessagesOptions): AiRuntimeHistorySnapshot {
    const instance = this.getInstanceOrThrow(options.instanceId)
    if (instance.status !== 'Ready') {
      throw new Error(`appendMessages requires Ready runtime instance ${options.instanceId}; current status is ${instance.status}`)
    }
    return this.history.appendMessages(instance, options)
  }

  getAvailableFunctions(instanceId: string): readonly AiRuntimeFunctionExposure[] {
    return this.projector.cloneExposure(this.getInstanceOrThrow(instanceId).availableFunctions)
  }

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

  listInstances(): readonly AiRuntimeInstanceSnapshot[] {
    return Array.from(this.instances.values()).map((instance) => this.projector.createInstanceSnapshot(instance))
  }

  getInstanceDetail(instanceId: string): AiRuntimeInstanceDetail | null {
    const instance = this.instances.get(instanceId)
    return instance ? this.projector.createInstanceDetail(instance) : null
  }

  getInstanceHistory(instanceId: string): AiRuntimeHistorySnapshot | null {
    const instance = this.instances.get(instanceId)
    return instance ? this.history.createHistorySnapshot(instance) : null
  }

  subscribe(listener: AiRuntimeEventListener): () => void {
    return this.eventHub.subscribe(listener)
  }

  private getInstanceOrThrow(instanceId: string): AiRuntimeInstanceState {
    const instance = this.instances.get(instanceId)
    if (instance === undefined) {
      throw new Error(`Unknown AI runtime instance: ${instanceId}`)
    }
    return instance
  }

  private getBusinessOrThrow(businessId: string): AiBusinessRegistration {
    const business = this.businesses.get(businessId)
    if (business === undefined) {
      throw new Error(`Unknown AI business registration: ${businessId}`)
    }
    return business
  }

  private assertBusinessReady(business: AiBusinessRegistration): AiRuntimeFunctionCallResult | null {
    const status = this.projector.businessStatus(business)
    if (status === 'Ready') return null
    return AiRuntime.createFailure(
      'BUSINESS_NOT_READY',
      `Business service ${business.businessId} is ${status}`,
      'Start or repair the business service before exposing it to the LLM runtime instance.',
    )
  }

  private assertReady(instance: AiRuntimeInstanceState, action: AiRuntimeAction): AiRuntimeFunctionCallResult | null {
    if (instance.status === 'Ready') return null
    return AiRuntime.createFailure(
      'INSTANCE_NOT_READY',
      `${action} requires runtime instance ${instance.instanceId} to be Ready, current status is ${instance.status}`,
      'Call startInstance to create or resume a Ready LLM runtime instance before invoking business functions.',
    )
  }

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
    const businessFailure = this.assertBusinessReady(business)
    if (businessFailure !== null) return businessFailure

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

  private async refreshInstanceExposure(instance: AiRuntimeInstanceState): Promise<void> {
    await this.projector.refreshInstanceExposure(instance, this.getBusinessOrThrow(instance.businessId))
  }

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

  private static defaultInstanceId(businessId: string, businessInstanceId: string): string {
    return `${businessId}-${businessInstanceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  private static createDefaultRecordId(kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure'): string {
    return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  private static assertId(kind: string, value: string): void {
    if (value.trim().length === 0) {
      throw new Error(`${kind} must not be empty`)
    }
    if (value.includes('@')) {
      throw new Error(`${kind} must not contain @: ${value}`)
    }
  }

  private static actionOf<
    TBusinessId extends string,
    TModuleId extends string,
    TFunctionId extends string,
  >(businessId: TBusinessId, moduleId: TModuleId, functionId: TFunctionId): AiRuntimeAction<TBusinessId, TModuleId, TFunctionId> {
    return `${businessId}@${moduleId}@${functionId}`
  }

  private static createFailure(code: string, msg: string, fix: string): AiRuntimeFunctionCallResult {
    return { ok: false, code, msg, fix }
  }

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

  private makeBusinessInstanceKey(businessId: string, businessInstanceId: string): string {
    return `${businessId}::${businessInstanceId}`
  }
}
