import type {
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiRuntimeAction,
  AiRuntimeActivePathSnapshot,
  AiRuntimeAppendMessagesOptions,
  AiRuntimeApi,
  AiRuntimeClearActivePathOptions,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallResult,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeHistorySnapshot,
  AiRuntimeInstanceDetail,
  AiRuntimeInstanceSnapshot,
  AiRuntimeModuleInstanceScope,
  AiRuntimeOptions,
  AiRuntimeSetActivePathOptions,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeStopModuleInstanceOptions,
  AiRuntimeEventListener,
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
 * Runtime 只管理模块注册、LLM-facing 实例、函数暴露、历史和事件。真实业务状态由模块实现自管。
 */
export class AiRuntime implements AiRuntimeApi {
  private readonly modules = new Map<string, AiModuleRegistration>()

  private readonly instances = new Map<string, AiRuntimeInstanceState>()

  private readonly instancesByModuleInstance = new Map<string, string>()

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

  registerModule(registration: AiModuleRegistration): void {
    this.projector.assertUniqueActions(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI module registration: ${registration.moduleId}`)
    }
    this.modules.set(registration.moduleId, registration)
  }

  getModuleRegistration(moduleId: string): AiModuleRegistration | undefined {
    return this.modules.get(moduleId)
  }

  listModuleRegistrations(): readonly AiModuleRegistration[] {
    return Array.from(this.modules.values())
  }

  async startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult> {
    const module = this.getModuleOrThrow(options.moduleId)
    const moduleKey = this.makeModuleInstanceKey(options.moduleId, options.moduleInstanceId)
    const existingInstanceId = this.instancesByModuleInstance.get(moduleKey)
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

    const instanceId = this.createUniqueInstanceId(options.moduleId, options.moduleInstanceId)
    const moduleExposure = await this.projector.projectModule(module, {
      instanceId,
      runtimeInstanceId: instanceId,
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
    })

    const instance: AiRuntimeInstanceState = {
      instanceId,
      moduleId: options.moduleId,
      module: moduleExposure,
      moduleInstanceId: options.moduleInstanceId,
      status: 'Starting',
      promptSnapshot: this.projector.buildPromptSnapshot(moduleExposure),
      availableFunctions: this.projector.flattenFunctions(moduleExposure),
      activePath: [],
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
    this.instancesByModuleInstance.set(moduleKey, instanceId)
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
    const module = this.getModuleOrThrow(instance.moduleId)

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
      await this.finishStop(instance, module, options.reason)
    }

    return {
      instance: this.projector.createInstanceSnapshot(instance),
      history: this.history.createHistorySnapshot(instance),
    }
  }

  async stopInstanceByModuleScope(options: AiRuntimeStopModuleInstanceOptions): Promise<AiRuntimeStopInstanceResult> {
    const instance = this.getInstanceByModuleScopeOrThrow(options)
    return this.stopInstance({
      instanceId: instance.instanceId,
      mode: options.mode,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
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

    const { instance, module, definition, exposure } = resolved
    const contextArgs = this.prepareExecutionArgs(instance, exposure, options.args)
    if ('ok' in contextArgs) {
      this.history.recordFunctionCall(instance, options.action, options.args, contextArgs)
      return { result: contextArgs, history: this.history.createHistorySnapshot(instance) }
    }

    const validationError = this.argValidator.validateArgsBySchema(exposure.paramsSchema, contextArgs.effectiveArgs)
    if (validationError !== null) {
      const result = AiRuntime.createFailure('INVALID_ARGS', validationError, `Use paramsSchema from getAvailableFunctions for ${options.action}.`)
      this.history.recordFunctionCall(instance, options.action, options.args, result)
      return { result, history: this.history.createHistorySnapshot(instance) }
    }

    const executionContext: FunctionExecutionContext = {
      instanceId: instance.instanceId,
      runtimeInstanceId: instance.instanceId,
      moduleId: instance.moduleId,
      moduleInstanceId: instance.moduleInstanceId,
      modulePath: exposure.modulePath,
      moduleIds: exposure.moduleIds,
      functionId: exposure.functionId,
      action: options.action,
      moduleInstances: contextArgs.moduleInstances,
      activePath: this.projector.createActivePathSnapshot(instance),
    }

    let customValidationError: string | null
    try {
      customValidationError = definition.validate?.(contextArgs.executionArgs, executionContext) ?? null
    } catch (error) {
      const result = AiRuntime.createFailure(
        'VALIDATE_ERROR',
        AiInvocationProtocol.toErrorMessage(error),
        `Fix ${options.action} validator or retry with arguments that satisfy the module rule.`,
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
      actionModulePath: exposure.modulePath,
      functionId: exposure.functionId,
    })

    let result: AiRuntimeFunctionCallResult<unknown>
    try {
      const executed = await definition.execute(contextArgs.executionArgs, executionContext)
      if (AiRuntime.isFunctionCallResult(executed)) {
        result = executed
      } else {
        const warnings = definition.postValidate?.(contextArgs.executionArgs, executed, executionContext) ?? []
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
        `Fix ${options.action} implementation or retry with valid args after checking module state.`,
      )
    }

    this.history.recordFunctionCall(instance, options.action, options.args, result)
    this.eventHub.emit(instance, result.ok ? 'function.succeeded' : 'function.failed', { action: options.action, result }, {
      actionModulePath: exposure.modulePath,
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
      await this.finishStop(instance, module, 'pendingStop')
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

  setActivePath(options: AiRuntimeSetActivePathOptions): AiRuntimeActivePathSnapshot {
    const instance = this.getInstanceOrThrow(options.instanceId)
    const normalized = options.bindings.map((binding) => this.normalizeActivePathBinding(instance, binding))
    const next = instance.activePath.filter((existing) =>
      !normalized.some((incoming) => incoming.modulePath === existing.modulePath || incoming.paramName === existing.paramName),
    )
    instance.activePath = [...next, ...normalized]
    const snapshot = this.projector.createActivePathSnapshot(instance)
    this.eventHub.emit(instance, 'activePath.updated', snapshot)
    return snapshot
  }

  clearActivePath(options: AiRuntimeClearActivePathOptions): AiRuntimeActivePathSnapshot {
    const instance = this.getInstanceOrThrow(options.instanceId)
    if (options.keys === undefined || options.keys.length === 0) {
      instance.activePath = []
    } else {
      const keys = new Set(options.keys)
      instance.activePath = instance.activePath.filter((binding) =>
        !keys.has(binding.modulePath) && (binding.paramName === undefined || !keys.has(binding.paramName)),
      )
    }
    const snapshot = this.projector.createActivePathSnapshot(instance)
    this.eventHub.emit(instance, 'activePath.updated', snapshot)
    return snapshot
  }

  getActivePath(instanceId: string): AiRuntimeActivePathSnapshot {
    return this.projector.createActivePathSnapshot(this.getInstanceOrThrow(instanceId))
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

  getInstanceByModuleScope(scope: AiRuntimeModuleInstanceScope): AiRuntimeInstanceSnapshot | null {
    const instance = this.resolveInstanceByScope(scope)
    return instance ? this.projector.createInstanceSnapshot(instance) : null
  }

  getInstanceHistoryByModuleScope(scope: AiRuntimeModuleInstanceScope): AiRuntimeHistorySnapshot | null {
    const instance = this.resolveInstanceByScope(scope)
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

  private getModuleOrThrow(moduleId: string): AiModuleRegistration {
    const module = this.modules.get(moduleId)
    if (module === undefined) {
      throw new Error(`Unknown AI module registration: ${moduleId}`)
    }
    return module
  }

  private assertReady(instance: AiRuntimeInstanceState, action: AiRuntimeAction): AiRuntimeFunctionCallResult | null {
    if (instance.status === 'Ready') return null
    return AiRuntime.createFailure(
      'INSTANCE_NOT_READY',
      `${action} requires runtime instance ${instance.instanceId} to be Ready, current status is ${instance.status}`,
      'Call startInstance to create or resume a Ready LLM runtime instance before invoking module functions.',
    )
  }

  private resolveFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): AiRuntimeResolvedFunctionCall | AiRuntimeFunctionCallResult {
    let address: ReturnType<typeof AiInvocationProtocol.parseActionPath>
    try {
      address = AiInvocationProtocol.parseActionPath(options.action)
    } catch (error) {
      return AiRuntime.createFailure('INVALID_ACTION', AiInvocationProtocol.toErrorMessage(error), 'Use action format module/.../function.')
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

    if (address.moduleIds[0] !== instance.moduleId) {
      return AiRuntime.createFailure(
        'MODULE_MISMATCH',
        `Action ${options.action} targets module ${address.moduleIds[0] ?? ''}, but runtime instance ${instance.instanceId} is bound to ${instance.moduleId}.`,
        'Use an action from getAvailableFunctions for the same instanceId.',
      )
    }

    const module = this.findModuleRegistration(this.getModuleOrThrow(instance.moduleId), address.moduleIds)
    if (module === null) {
      return AiRuntime.createFailure(
        'MODULE_NOT_AVAILABLE',
        `Module path ${address.modulePath} is not registered under module ${instance.moduleId}.`,
        'Use a module path exposed by the current module registration.',
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
        `Function definition ${options.action} is missing from module ${address.modulePath}.`,
        'Fix the module registration so registered functions and exposed actions stay aligned.',
      )
    }

    return { instance, module, definition, exposure }
  }

  private prepareExecutionArgs(
    instance: AiRuntimeInstanceState,
    exposure: AiRuntimeFunctionExposure,
    rawArgs: unknown,
  ): {
    effectiveArgs: Record<string, unknown>
    executionArgs: unknown
    moduleInstances: Readonly<Record<string, string>>
  } | AiRuntimeFunctionCallResult {
    const args = this.isRecord(rawArgs) ? { ...rawArgs } : rawArgs
    const effectiveArgs = this.isRecord(args) ? { ...args } : {}
    let executionArgs = this.isRecord(args) ? { ...args } : args
    const moduleInstances: Record<string, string> = {}

    for (const param of exposure.contextParams) {
      const active = this.resolveActiveBinding(instance, param.modulePath, param.paramName)
      const fromArgs = this.isRecord(rawArgs) ? rawArgs[param.paramName] : undefined
      if (fromArgs !== undefined && typeof fromArgs !== 'string') {
        return AiRuntime.createFailure(
          'INVALID_ARGS',
          `${exposure.action} expects ${param.paramName} to be a string module instance id.`,
          `Pass a string ${param.paramName}, or set active path for ${param.modulePath}.`,
        )
      }
      if (active !== undefined && fromArgs !== undefined && active.instanceId !== fromArgs) {
        return AiRuntime.createFailure(
          'CONTEXT_MISMATCH',
          `${exposure.action} received ${param.paramName}=${fromArgs}, but active path ${param.modulePath} is ${active.instanceId}.`,
          'Use the active module instance id or update active path before retrying.',
        )
      }
      const value = fromArgs ?? active?.instanceId
      if (typeof value !== 'string' || value.trim().length === 0) {
        return AiRuntime.createFailure(
          'MISSING_CONTEXT_INSTANCE',
          `${exposure.action} requires module instance ${param.paramName} for ${param.modulePath}.`,
          `Pass ${param.paramName} in args or set active path for ${param.modulePath}.`,
        )
      }
      effectiveArgs[param.paramName] = value
      moduleInstances[param.paramName] = value
      if (this.isRecord(executionArgs)) {
        const { [param.paramName]: _unused, ...rest } = executionArgs
        void _unused
        executionArgs = rest
      }
    }

    return {
      effectiveArgs,
      executionArgs,
      moduleInstances,
    }
  }

  private normalizeActivePathBinding(instance: AiRuntimeInstanceState, binding: AiModuleInstanceBinding): AiModuleInstanceBinding {
    const module = this.findModuleExposure(instance.module, binding.modulePath)
    if (module === null) {
      throw new Error(`Unknown active path module: ${binding.modulePath}`)
    }
    const paramName = binding.paramName ?? module.instanceParam?.name
    if (paramName === undefined || paramName.trim().length === 0) {
      throw new Error(`Active path module ${binding.modulePath} does not declare instanceParam; pass paramName explicitly.`)
    }
    return {
      modulePath: binding.modulePath,
      instanceId: binding.instanceId,
      paramName,
    }
  }

  private resolveActiveBinding(instance: AiRuntimeInstanceState, modulePath: string, paramName: string): AiModuleInstanceBinding | undefined {
    const active = instance.activePath.find((binding) => binding.modulePath === modulePath || binding.paramName === paramName)
    if (active !== undefined) return active
    if (modulePath === instance.moduleId) {
      const module = this.findModuleExposure(instance.module, modulePath)
      if (module?.instanceParam?.name === paramName) {
        return { modulePath, paramName, instanceId: instance.moduleInstanceId }
      }
    }
    return undefined
  }

  private findModuleRegistration(module: AiModuleRegistration, moduleIds: readonly string[]): AiModuleRegistration | null {
    if (moduleIds.length === 0 || module.moduleId !== moduleIds[0]) return null
    let current: AiModuleRegistration = module
    for (const moduleId of moduleIds.slice(1)) {
      const child = (current.modules ?? []).find((candidate) => candidate.moduleId === moduleId)
      if (child === undefined) return null
      current = child
    }
    return current
  }

  private findModuleExposure(module: AiRuntimeFunctionExposure | AiRuntimeInstanceState['module'], modulePath: string): AiRuntimeInstanceState['module'] | null {
    if ('functions' in module && module.modulePath === modulePath) return module
    if (!('modules' in module)) return null
    for (const child of module.modules) {
      const found = this.findModuleExposure(child, modulePath)
      if (found !== null) return found
    }
    return null
  }

  private async refreshInstanceExposure(instance: AiRuntimeInstanceState): Promise<void> {
    await this.projector.refreshInstanceExposure(instance, this.getModuleOrThrow(instance.moduleId))
  }

  private async finishStop(
    instance: AiRuntimeInstanceState,
    module: AiModuleRegistration,
    reason: string | undefined,
  ): Promise<void> {
    if (instance.status !== 'Stopping') {
      this.history.setStatus(instance, 'Stopping', reason)
      this.eventHub.emit(instance, 'instance.stopping', { reason })
    }

    try {
      await module.releaseInstance?.({
        instanceId: instance.instanceId,
        runtimeInstanceId: instance.instanceId,
        moduleId: instance.moduleId,
        moduleInstanceId: instance.moduleInstanceId,
      })
      this.history.setStatus(instance, 'Stopped', reason)
      this.eventHub.emit(instance, 'instance.stopped', { reason })
    } catch (error) {
      const message = AiInvocationProtocol.toErrorMessage(error)
      this.history.setStatus(instance, 'Failed', message)
      this.eventHub.emit(instance, 'instance.failed', { reason: 'releaseInstance', error: message })
    }
  }

  private static defaultInstanceId(moduleId: string, moduleInstanceId: string): string {
    return `${moduleId}-${moduleInstanceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  private static createDefaultRecordId(kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure'): string {
    return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  private static assertId(kind: string, value: string): void {
    if (value.trim().length === 0) {
      throw new Error(`${kind} must not be empty`)
    }
    if (value.includes('/') || value.includes('@')) {
      throw new Error(`${kind} must not contain / or @: ${value}`)
    }
  }

  private static actionOf(modulePath: string, functionId: string): AiRuntimeAction {
    return `${modulePath}/${functionId}`
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
      moduleId: '',
      moduleInstanceId: '',
      version: 0,
      messages: [],
      functionCalls: [],
      lifecycleMarkers: [],
      functionExposureSnapshots: [],
    }
  }

  private makeModuleInstanceKey(moduleId: string, moduleInstanceId: string): string {
    return `${moduleId}::${moduleInstanceId}`
  }

  private resolveInstanceByScope(scope: AiRuntimeModuleInstanceScope): AiRuntimeInstanceState | null {
    const instanceId = this.instancesByModuleInstance.get(this.makeModuleInstanceKey(scope.moduleId, scope.moduleInstanceId))
    if (instanceId === undefined) return null
    return this.instances.get(instanceId) ?? null
  }

  private getInstanceByModuleScopeOrThrow(scope: AiRuntimeModuleInstanceScope): AiRuntimeInstanceState {
    const instance = this.resolveInstanceByScope(scope)
    if (instance === null) {
      throw new Error(`Unknown AI runtime instance for module ${scope.moduleId} + ${scope.moduleInstanceId}`)
    }
    return instance
  }

  private createUniqueInstanceId(moduleId: string, moduleInstanceId: string): string {
    const base = this.createInstanceId(moduleId, moduleInstanceId)
    if (!this.instances.has(base)) return base
    let counter = 1
    while (this.instances.has(`${base}-${counter}`)) counter += 1
    return `${base}-${counter}`
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
