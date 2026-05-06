import type {
  AiCore,
  AiCoreAction,
  AiCoreAppendMessagesOptions,
  AiCoreEvent,
  AiCoreEventListener,
  AiCoreEventType,
  AiCoreExecuteFunctionCallOptions,
  AiCoreExecuteFunctionCallResult,
  AiCoreFunctionCallRecord,
  AiCoreFunctionCallResult,
  AiCoreFunctionExposure,
  AiCoreFunctionExposureSnapshot,
  AiCoreHistoryMessage,
  AiCoreHistorySnapshot,
  AiCoreInstanceDetail,
  AiCoreInstanceSnapshot,
  AiCoreInstanceStatus,
  AiCoreLifecycleMarker,
  AiCoreModuleRuntimeSnapshot,
  AiCoreOptions,
  AiCoreStartSessionOptions,
  AiCoreStartSessionResult,
  AiCoreStopSessionOptions,
  AiCoreStopSessionResult,
  FunctionExecutionContext,
  IBusinessDefinition,
  IFunctionDefinition,
  IModule,
  ModuleRuntime,
  ModuleRuntimeLifecycleContext,
} from '../protocol/business-contracts'
import { parseActionAddress, toErrorMessage } from '../protocol/invocation-helpers'

interface AiCoreHistoryState {
  version: number
  messages: AiCoreHistoryMessage[]
  functionCalls: AiCoreFunctionCallRecord[]
  lifecycleMarkers: AiCoreLifecycleMarker[]
  functionExposureSnapshots: AiCoreFunctionExposureSnapshot[]
}

interface AiCoreInstanceState {
  instanceId: string
  businessId: string
  sessionId: string
  status: AiCoreInstanceStatus
  modules: Map<string, ModuleRuntime>
  promptSnapshot: string
  availableFunctions: AiCoreFunctionExposure[]
  history: AiCoreHistoryState
  seq: number
  pendingPause: boolean
  pendingStop: boolean
}

interface ResolvedFunctionCall {
  instance: AiCoreInstanceState
  module: IModule<ModuleRuntime>
  runtime: ModuleRuntime
  definition: IFunctionDefinition<unknown, unknown>
  exposure: AiCoreFunctionExposure
}

function defaultInstanceId(businessId: string): string {
  return `${businessId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createDefaultRecordId(kind: string): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function assertId(kind: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${kind} must not be empty`)
  }
  if (value.includes('@')) {
    throw new Error(`${kind} must not contain @: ${value}`)
  }
}

function actionOf<
  TBusinessId extends string,
  TModuleId extends string,
  TFunctionId extends string,
>(businessId: TBusinessId, moduleId: TModuleId, functionId: TFunctionId): AiCoreAction<TBusinessId, TModuleId, TFunctionId> {
  return `${businessId}@${moduleId}@${functionId}`
}

function createSessionId(businessId: string, instanceId: string): string {
  return `${businessId}:${instanceId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneExposure(functions: ReadonlyArray<AiCoreFunctionExposure>): AiCoreFunctionExposure[] {
  return functions.map((item) => ({
    action: item.action,
    businessId: item.businessId,
    moduleId: item.moduleId,
    functionId: item.functionId,
    description: item.description,
    paramsSchema: item.paramsSchema,
    ...(item.resultSchema !== undefined ? { resultSchema: item.resultSchema } : {}),
    ...(item.maxExecutionMs !== undefined ? { maxExecutionMs: item.maxExecutionMs } : {}),
    ...(item.usageRules !== undefined ? { usageRules: item.usageRules } : {}),
  }))
}

function createHistorySnapshot(instance: AiCoreInstanceState): AiCoreHistorySnapshot {
  return {
    instanceId: instance.instanceId,
    version: instance.history.version,
    messages: [...instance.history.messages],
    functionCalls: [...instance.history.functionCalls],
    lifecycleMarkers: [...instance.history.lifecycleMarkers],
    functionExposureSnapshots: instance.history.functionExposureSnapshots.map((snapshot) => ({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      functions: cloneExposure(snapshot.functions),
    })),
  }
}

function createInstanceSnapshot(instance: AiCoreInstanceState): AiCoreInstanceSnapshot {
  return {
    instanceId: instance.instanceId,
    businessId: instance.businessId,
    status: instance.status,
    promptSnapshot: instance.promptSnapshot,
    availableFunctions: cloneExposure(instance.availableFunctions),
  }
}

function readableSchemaType(type: unknown): string {
  return Array.isArray(type) ? type.join(' | ') : String(type)
}

function matchesSchemaType(value: unknown, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type]
  for (const candidate of types) {
    if (candidate === 'null' && value === null) return true
    if (candidate === 'array' && Array.isArray(value)) return true
    if (candidate === 'object' && isRecord(value)) return true
    if (candidate === 'string' && typeof value === 'string') return true
    if (candidate === 'number' && typeof value === 'number') return true
    if (candidate === 'integer' && Number.isInteger(value)) return true
    if (candidate === 'boolean' && typeof value === 'boolean') return true
  }
  return false
}

function validateArgsBySchema(schema: Record<string, unknown>, args: unknown): string | null {
  if (Object.keys(schema).length === 0) return null
  if (schema['type'] !== 'object') return null
  if (!isRecord(args)) return 'args must be an object'

  const required = Array.isArray(schema['required']) ? schema['required'].filter((key): key is string => typeof key === 'string') : []
  for (const key of required) {
    if (!(key in args) || args[key] === undefined) {
      return `missing required arg: ${key}`
    }
  }

  const properties = isRecord(schema['properties']) ? schema['properties'] : {}
  for (const [key, property] of Object.entries(properties)) {
    if (!(key in args) || args[key] === undefined || !isRecord(property) || property['type'] === undefined) continue
    if (!matchesSchemaType(args[key], property['type'])) {
      return `arg ${key} must be ${readableSchemaType(property['type'])}`
    }
  }

  return null
}

function createFailure(code: string, msg: string, fix: string): AiCoreFunctionCallResult {
  return { ok: false, code, msg, fix }
}

function isFunctionCallResult(value: unknown): value is AiCoreFunctionCallResult<unknown> {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && typeof (value as { ok: unknown }).ok === 'boolean'
}

export function createAiCore(options: AiCoreOptions = {}): AiCore {
  const businesses = new Map<string, IBusinessDefinition>()
  const instances = new Map<string, AiCoreInstanceState>()
  const listeners = new Set<AiCoreEventListener>()
  const runtimeReader = {
    get<TRuntime extends ModuleRuntime = ModuleRuntime>(instanceId: string, moduleId: string): TRuntime | null {
      return (instances.get(instanceId)?.modules.get(moduleId) as TRuntime | undefined) ?? null
    },
  }
  const createInstanceId = options.createInstanceId ?? defaultInstanceId
  const createRecordId = options.createRecordId ?? createDefaultRecordId
  const now = options.now ?? Date.now

  function emit(instance: AiCoreInstanceState, type: AiCoreEventType, payload: unknown, details: { moduleId?: string; functionId?: string; causeEventId?: string } = {}): AiCoreEvent {
    instance.seq += 1
    const event: AiCoreEvent = {
      eventId: createRecordId('event'),
      seq: instance.seq,
      timestamp: now(),
      type,
      businessId: instance.businessId,
      instanceId: instance.instanceId,
      ...(details.moduleId !== undefined ? { moduleId: details.moduleId } : {}),
      ...(details.functionId !== undefined ? { functionId: details.functionId } : {}),
      ...(details.causeEventId !== undefined ? { causeEventId: details.causeEventId } : {}),
      payload,
    }
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Event listeners are observational only.
      }
    }
    return event
  }

  function markLifecycle(instance: AiCoreInstanceState, status: AiCoreInstanceStatus, reason?: string): void {
    instance.history.lifecycleMarkers.push({
      id: createRecordId('lifecycle'),
      timestamp: now(),
      status,
      ...(reason !== undefined ? { reason } : {}),
    })
    instance.history.version += 1
  }

  function setStatus(instance: AiCoreInstanceState, status: AiCoreInstanceStatus, reason?: string): void {
    instance.status = status
    markLifecycle(instance, status, reason)
  }

  function getInstanceOrThrow(instanceId: string): AiCoreInstanceState {
    const instance = instances.get(instanceId)
    if (instance === undefined) {
      throw new Error(`Unknown AI core instance: ${instanceId}`)
    }
    return instance
  }

  function getBusinessOrThrow(businessId: string): IBusinessDefinition {
    const business = businesses.get(businessId)
    if (business === undefined) {
      throw new Error(`Unknown AI business definition: ${businessId}`)
    }
    return business
  }

  function getModuleOrThrow(business: IBusinessDefinition, moduleId: string): IModule<ModuleRuntime> {
    const module = business.modules.find((candidate) => candidate.moduleId === moduleId)
    if (module === undefined) {
      throw new Error(`Unknown module ${moduleId} for business ${business.businessId}`)
    }
    return module
  }

  function assertReady(instance: AiCoreInstanceState, action: string): AiCoreFunctionCallResult | null {
    if (instance.status === 'Ready') return null
    return createFailure(
      'INSTANCE_NOT_READY',
      `${action} requires instance ${instance.instanceId} to be Ready, current status is ${instance.status}`,
      'Call startSession to create or resume a Ready instance before invoking business functions.',
    )
  }

  function projectFunctions(business: IBusinessDefinition): AiCoreFunctionExposure[] {
    const actions = new Set<string>()
    const exposures: AiCoreFunctionExposure[] = []
    for (const module of business.modules) {
      for (const definition of module.getFunctions()) {
        assertId('functionId', definition.functionId)
        const action = actionOf(business.businessId, module.moduleId, definition.functionId)
        if (actions.has(action)) {
          throw new Error(`Duplicate function action in business ${business.businessId}: ${action}`)
        }
        actions.add(action)
        exposures.push({
          action,
          businessId: business.businessId,
          moduleId: module.moduleId,
          functionId: definition.functionId,
          description: definition.description,
          paramsSchema: definition.paramsSchema,
          ...(definition.resultSchema !== undefined ? { resultSchema: definition.resultSchema } : {}),
          ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
          ...(definition.usageRules !== undefined ? { usageRules: definition.usageRules } : {}),
          ...(definition.failureModes !== undefined ? { failureModes: definition.failureModes } : {}),
        })
      }
    }
    return exposures
  }

  function recordExposure(instance: AiCoreInstanceState): void {
    instance.history.functionExposureSnapshots.push({
      id: createRecordId('exposure'),
      timestamp: now(),
      functions: cloneExposure(instance.availableFunctions),
    })
    instance.history.version += 1
    emit(instance, 'history.functionExposure.snapshot', { total: instance.availableFunctions.length })
    emit(instance, 'functions.exposed', { functions: cloneExposure(instance.availableFunctions) })
  }

  async function buildPromptSnapshot(business: IBusinessDefinition, instance: AiCoreInstanceState): Promise<string> {
    const prompts: string[] = []
    for (const module of business.modules) {
      const prompt = await module.getPrompt({
        instanceId: instance.instanceId,
        businessId: business.businessId,
        moduleId: module.moduleId,
        runtimeReader,
      })
      if (prompt !== null && prompt.trim().length > 0) {
        prompts.push(prompt)
      }
    }
    return prompts.join('\n\n')
  }

  async function startModuleRuntime(business: IBusinessDefinition, instance: AiCoreInstanceState, module: IModule<ModuleRuntime>): Promise<void> {
    emit(instance, 'module.starting', {}, { moduleId: module.moduleId })
    const runtime = module.createRuntime
      ? await module.createRuntime({ instanceId: instance.instanceId, businessId: business.businessId, moduleId: module.moduleId, runtimeReader })
      : {}
    instance.modules.set(module.moduleId, runtime)
    const lifecycleContext: ModuleRuntimeLifecycleContext = {
      instanceId: instance.instanceId,
      businessId: business.businessId,
      moduleId: module.moduleId,
      runtimeReader,
      runtime,
    }
    await runtime.onStart?.(lifecycleContext)
    emit(instance, 'module.started', {}, { moduleId: module.moduleId })
    emit(instance, 'module.available', {}, { moduleId: module.moduleId })
  }

  async function stopModuleRuntime(business: IBusinessDefinition, instance: AiCoreInstanceState, module: IModule<ModuleRuntime>): Promise<void> {
    const runtime = instance.modules.get(module.moduleId)
    if (runtime === undefined) return
    emit(instance, 'module.stopping', {}, { moduleId: module.moduleId })
    const lifecycleContext: ModuleRuntimeLifecycleContext = {
      instanceId: instance.instanceId,
      businessId: business.businessId,
      moduleId: module.moduleId,
      runtimeReader,
      runtime,
    }
    await runtime.onStop?.(lifecycleContext)
    await module.destroyRuntime?.(runtime, lifecycleContext)
    instance.modules.delete(module.moduleId)
    emit(instance, 'module.stopped', {}, { moduleId: module.moduleId })
  }

  function resolveFunctionCall(options: AiCoreExecuteFunctionCallOptions): ResolvedFunctionCall | AiCoreFunctionCallResult {
    let address: ReturnType<typeof parseActionAddress>
    try {
      address = parseActionAddress(options.action)
    } catch (error) {
      return createFailure('INVALID_ACTION', toErrorMessage(error), 'Use action format business@module@function.')
    }

    const instance = instances.get(options.instanceId)
    if (instance === undefined) {
      return createFailure('UNKNOWN_INSTANCE', `Unknown AI core instance: ${options.instanceId}`, 'Call startSession before executeFunctionCall and pass its instanceId envelope field.')
    }
    const readyFailure = assertReady(instance, options.action)
    if (readyFailure !== null) return readyFailure
    if (address.business !== instance.businessId) {
      return createFailure('BUSINESS_MISMATCH', `Action ${options.action} targets business ${address.business}, but instance ${instance.instanceId} belongs to ${instance.businessId}.`, 'Use an action from getAvailableFunctions for the same instanceId.')
    }

    const business = getBusinessOrThrow(instance.businessId)
    const module = getModuleOrThrow(business, address.module)
    const runtime = instance.modules.get(address.module)
    if (runtime === undefined) {
      return createFailure('MODULE_RUNTIME_MISSING', `Module runtime ${address.module} is missing for instance ${instance.instanceId}.`, 'Restart or resume the business instance so core can recreate module runtimes.')
    }

    const exposure = instance.availableFunctions.find((candidate) => candidate.action === options.action)
    if (exposure === undefined) {
      return createFailure('FUNCTION_NOT_AVAILABLE', `Function ${options.action} is not available for instance ${instance.instanceId}.`, 'Call getAvailableFunctions and choose one of the exposed actions for this instance.')
    }

    const definition = module.getFunctions().find((candidate) => candidate.functionId === address.function)
    if (definition === undefined) {
      return createFailure('FUNCTION_DEFINITION_MISSING', `Function definition ${options.action} is missing from module ${address.module}.`, 'Fix the business definition so function catalogs and exposed actions stay aligned.')
    }

    return { instance, module, runtime, definition, exposure }
  }

  function recordFunctionCall(instance: AiCoreInstanceState, action: string, args: unknown, result: AiCoreFunctionCallResult<unknown>): void {
    instance.history.functionCalls.push({
      id: createRecordId('functionCall'),
      timestamp: now(),
      instanceId: instance.instanceId,
      action,
      args,
      result,
    })
    instance.history.version += 1
    emit(instance, 'history.functionCall.appended', { action, result })
  }

  function runtimeSnapshots(instance: AiCoreInstanceState): AiCoreModuleRuntimeSnapshot[] {
    return Array.from(instance.modules.entries()).map(([moduleId, runtime]) => ({
      moduleId,
      runtime: runtime.toSnapshot ? runtime.toSnapshot() : runtime,
    }))
  }

  function registerBusiness(definition: IBusinessDefinition): void {
    assertId('businessId', definition.businessId)
    if (businesses.has(definition.businessId)) {
      throw new Error(`Duplicate AI business definition: ${definition.businessId}`)
    }
    const moduleIds = new Set<string>()
    for (const module of definition.modules) {
      assertId('moduleId', module.moduleId)
      if (moduleIds.has(module.moduleId)) {
        throw new Error(`Duplicate module ${module.moduleId} in business ${definition.businessId}`)
      }
      moduleIds.add(module.moduleId)
    }
    projectFunctions(definition)
    businesses.set(definition.businessId, definition)
  }

  async function startSession(options: AiCoreStartSessionOptions): Promise<AiCoreStartSessionResult> {
    const business = getBusinessOrThrow(options.businessId)
    if (options.instanceId !== undefined) {
      const existing = getInstanceOrThrow(options.instanceId)
      if (existing.businessId !== options.businessId) {
        throw new Error(`Cannot resume ${options.instanceId} as ${options.businessId}; existing business is ${existing.businessId}`)
      }
      if (existing.status === 'Stopped' || existing.status === 'Failed') {
        throw new Error(`Cannot resume terminal instance ${options.instanceId}: ${existing.status}`)
      }
      setStatus(existing, 'Resuming')
      emit(existing, 'instance.resuming', { restoreContext: options.restoreContext })
      existing.promptSnapshot = await buildPromptSnapshot(business, existing)
      existing.availableFunctions = projectFunctions(business)
      recordExposure(existing)
      setStatus(existing, 'Ready')
      emit(existing, 'instance.ready', createInstanceSnapshot(existing))
      return { ...createInstanceSnapshot(existing), history: createHistorySnapshot(existing) }
    }

    const instanceId = createInstanceId(options.businessId)
    if (instances.has(instanceId)) {
      throw new Error(`Duplicate AI core instanceId: ${instanceId}`)
    }
    const instance: AiCoreInstanceState = {
      instanceId,
      businessId: options.businessId,
      sessionId: createSessionId(options.businessId, instanceId),
      status: 'Starting',
      modules: new Map<string, ModuleRuntime>(),
      promptSnapshot: '',
      availableFunctions: [],
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
    instances.set(instanceId, instance)
    markLifecycle(instance, 'Starting')
    emit(instance, 'instance.starting', {})

    try {
      for (const module of business.modules) {
        await startModuleRuntime(business, instance, module)
      }
      instance.promptSnapshot = await buildPromptSnapshot(business, instance)
      instance.availableFunctions = projectFunctions(business)
      recordExposure(instance)
      emit(instance, 'instance.started', createInstanceSnapshot(instance))
      setStatus(instance, 'Ready')
      emit(instance, 'instance.ready', createInstanceSnapshot(instance))
      return { ...createInstanceSnapshot(instance), history: createHistorySnapshot(instance) }
    } catch (error) {
      setStatus(instance, 'Failed', toErrorMessage(error))
      emit(instance, 'instance.failed', { error: toErrorMessage(error) })
      for (const module of [...business.modules].reverse()) {
        await stopModuleRuntime(business, instance, module)
      }
      instances.delete(instanceId)
      throw error
    }
  }

  async function stopSession(options: AiCoreStopSessionOptions): Promise<AiCoreStopSessionResult> {
    const instance = getInstanceOrThrow(options.instanceId)
    const business = getBusinessOrThrow(instance.businessId)
    if (options.mode === 'pause') {
      if (instance.status === 'Executing') {
        instance.pendingPause = true
      } else if (instance.status !== 'Paused') {
        setStatus(instance, 'Paused', options.reason)
        emit(instance, 'instance.paused', { reason: options.reason })
      }
      return { instance: createInstanceSnapshot(instance), history: createHistorySnapshot(instance) }
    }

    if (instance.status !== 'Stopped') {
      if (instance.status === 'Executing') {
        instance.pendingStop = true
      }
      setStatus(instance, 'Stopping', options.reason)
      emit(instance, 'instance.stopping', { reason: options.reason })
      for (const module of [...business.modules].reverse()) {
        await stopModuleRuntime(business, instance, module)
      }
      setStatus(instance, 'Stopped', options.reason)
      emit(instance, 'instance.stopped', { reason: options.reason })
    }
    return { instance: createInstanceSnapshot(instance), history: createHistorySnapshot(instance) }
  }

  function appendMessages(options: AiCoreAppendMessagesOptions): AiCoreHistorySnapshot {
    const instance = getInstanceOrThrow(options.instanceId)
    if (instance.status !== 'Ready') {
      throw new Error(`appendMessages requires Ready instance ${options.instanceId}; current status is ${instance.status}`)
    }
    for (const message of options.messages) {
      instance.history.messages.push({
        id: createRecordId('message'),
        timestamp: now(),
        role: message.role,
        content: message.content,
      })
      instance.history.version += 1
      emit(instance, 'history.message.appended', { role: message.role })
    }
    return createHistorySnapshot(instance)
  }

  async function executeFunctionCall(options: AiCoreExecuteFunctionCallOptions): Promise<AiCoreExecuteFunctionCallResult> {
    const resolved = resolveFunctionCall(options)
    if ('ok' in resolved) {
      const instance = instances.get(options.instanceId)
      return {
        result: resolved,
        history: instance ? createHistorySnapshot(instance) : {
          instanceId: options.instanceId,
          version: 0,
          messages: [],
          functionCalls: [],
          lifecycleMarkers: [],
          functionExposureSnapshots: [],
        },
      }
    }

    const { instance, runtime, definition, exposure } = resolved
    const validationError = validateArgsBySchema(definition.paramsSchema, options.args)
    if (validationError !== null) {
      const result = createFailure('INVALID_ARGS', validationError, `Use paramsSchema from getAvailableFunctions for ${options.action}.`)
      recordFunctionCall(instance, options.action, options.args, result)
      return { result, history: createHistorySnapshot(instance) }
    }

    const executionAction = actionOf(instance.businessId, exposure.moduleId, exposure.functionId)
    const executionContext: FunctionExecutionContext = {
      instanceId: instance.instanceId,
      businessId: instance.businessId,
      moduleId: exposure.moduleId,
      functionId: exposure.functionId,
      action: executionAction,
      moduleRuntime: runtime,
      runtimeReader,
    }

    const customValidationError = definition.validate?.(options.args, executionContext) ?? null
    if (customValidationError !== null) {
      const result = createFailure('INVALID_ARGS', customValidationError, `Fix args for ${options.action} before retrying.`)
      recordFunctionCall(instance, options.action, options.args, result)
      return { result, history: createHistorySnapshot(instance) }
    }

    setStatus(instance, 'Executing')
    emit(instance, 'function.before', { action: options.action, args: options.args }, { moduleId: exposure.moduleId, functionId: exposure.functionId })

    let result: AiCoreFunctionCallResult<unknown>
    try {
      const decision = await runtime.beforeExecute?.({ ...executionContext, args: options.args })
      if (decision?.cancelled === true) {
        result = createFailure(
          decision.code ?? 'EXECUTE_CANCELLED',
          decision.msg ?? `Module ${exposure.moduleId} cancelled ${options.action}`,
          decision.fix ?? `Inspect beforeExecute decision for module ${exposure.moduleId}.`,
        )
      } else {
        const executed = await definition.execute(options.args, executionContext)
        if (isFunctionCallResult(executed)) {
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
      }
    } catch (error) {
      result = createFailure('EXECUTE_ERROR', toErrorMessage(error), `Fix ${options.action} implementation or retry with valid args after checking module runtime state.`)
    }

    try {
      await runtime.afterExecute?.({ ...executionContext, args: options.args, result })
    } catch (error) {
      if (result.ok) {
        result.warnings = [
          ...(result.warnings ?? []),
          {
            rule: 'module.afterExecute',
            detail: toErrorMessage(error),
            fix: `Inspect afterExecute hook for module ${exposure.moduleId}.`,
          },
        ]
      }
    }

    recordFunctionCall(instance, options.action, options.args, result)
    emit(instance, result.ok ? 'function.succeeded' : 'function.failed', { action: options.action, result }, { moduleId: exposure.moduleId, functionId: exposure.functionId })
    instance.availableFunctions = projectFunctions(getBusinessOrThrow(instance.businessId))
    recordExposure(instance)

    if (instance.pendingStop) {
      instance.pendingStop = false
      await stopSession({ instanceId: instance.instanceId, mode: 'stop', reason: 'pendingStop' })
    } else if (instance.pendingPause) {
      instance.pendingPause = false
      setStatus(instance, 'Paused', 'pendingPause')
      emit(instance, 'instance.paused', { reason: 'pendingPause' })
    } else {
      setStatus(instance, 'Ready')
      emit(instance, 'instance.ready', createInstanceSnapshot(instance))
    }

    return { result, history: createHistorySnapshot(instance) }
  }

  const api: AiCore = {
    runtimeReader,
    registerBusiness,
    getBusinessDefinition: (businessId) => businesses.get(businessId),
    listBusinesses: () => Array.from(businesses.values()),
    startSession,
    stopSession,
    appendMessages,
    getAvailableFunctions: (instanceId) => cloneExposure(getInstanceOrThrow(instanceId).availableFunctions),
    executeFunctionCall,
    listInstances: () => Array.from(instances.values()).map(createInstanceSnapshot),
    getInstanceDetail(instanceId: string): AiCoreInstanceDetail | null {
      const instance = instances.get(instanceId)
      if (instance === undefined) return null
      return {
        ...createInstanceSnapshot(instance),
        modules: runtimeSnapshots(instance),
        history: createHistorySnapshot(instance),
      }
    },
    getSessionHistory(instanceId: string): AiCoreHistorySnapshot | null {
      const instance = instances.get(instanceId)
      return instance ? createHistorySnapshot(instance) : null
    },
    subscribe(listener: AiCoreEventListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return api
}