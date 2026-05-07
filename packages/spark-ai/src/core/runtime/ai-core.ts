import type {
  AiBusinessRegistration,
  AiBusinessServiceStatus,
  AiCore,
  AiCoreAction,
  AiCoreAppendMessagesOptions,
  AiCoreBusinessExposure,
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
  AiCoreModuleExposure,
  AiCoreOptions,
  AiCoreStartSessionOptions,
  AiCoreStartSessionResult,
  AiCoreStopSessionOptions,
  AiCoreStopSessionResult,
  AiFunctionRegistration,
  FunctionExecutionContext,
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
  status: AiCoreInstanceStatus
  business: AiCoreBusinessExposure
  promptSnapshot: string
  availableFunctions: AiCoreFunctionExposure[]
  history: AiCoreHistoryState
  seq: number
  pendingPause: boolean
  pendingStop: boolean
}

interface ResolvedFunctionCall {
  instance: AiCoreInstanceState
  business: AiBusinessRegistration
  definition: AiFunctionRegistration<unknown, unknown>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function businessStatus(business: AiBusinessRegistration): AiBusinessServiceStatus {
  return business.getStatus?.() ?? 'Ready'
}

function cloneExposure(functions: readonly AiCoreFunctionExposure[]): AiCoreFunctionExposure[] {
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
    ...(item.failureModes !== undefined ? { failureModes: item.failureModes } : {}),
  }))
}

function cloneBusinessExposure(business: AiCoreBusinessExposure): AiCoreBusinessExposure {
  return {
    businessId: business.businessId,
    name: business.name,
    description: business.description,
    status: business.status,
    modules: business.modules.map((module) => ({
      moduleId: module.moduleId,
      name: module.name,
      description: module.description,
      ...(module.prompt !== undefined ? { prompt: module.prompt } : {}),
      functions: cloneExposure(module.functions),
    })),
  }
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
    business: cloneBusinessExposure(instance.business),
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
  const businesses = new Map<string, AiBusinessRegistration>()
  const instances = new Map<string, AiCoreInstanceState>()
  const listeners = new Set<AiCoreEventListener>()
  const createInstanceId = options.createInstanceId ?? defaultInstanceId
  const createRecordId = options.createRecordId ?? createDefaultRecordId
  const now = options.now ?? Date.now

  function emit(instance: AiCoreInstanceState, type: AiCoreEventType, payload: unknown, details: { moduleId?: string; functionId?: string } = {}): AiCoreEvent {
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
      throw new Error(`Unknown AI core adapter session: ${instanceId}`)
    }
    return instance
  }

  function getBusinessOrThrow(businessId: string): AiBusinessRegistration {
    const business = businesses.get(businessId)
    if (business === undefined) {
      throw new Error(`Unknown AI business registration: ${businessId}`)
    }
    return business
  }

  function assertBusinessReady(business: AiBusinessRegistration): AiCoreFunctionCallResult | null {
    const status = businessStatus(business)
    if (status === 'Ready') return null
    return createFailure(
      'BUSINESS_NOT_READY',
      `Business service ${business.businessId} is ${status}`,
      'Start or repair the business service before exposing it to the LLM adapter session.',
    )
  }

  function assertReady(instance: AiCoreInstanceState, action: AiCoreAction): AiCoreFunctionCallResult | null {
    if (instance.status === 'Ready') return null
    return createFailure(
      'INSTANCE_NOT_READY',
      `${action} requires adapter session ${instance.instanceId} to be Ready, current status is ${instance.status}`,
      'Call startSession to create or resume a Ready LLM adapter session before invoking business functions.',
    )
  }

  async function modulePrompt(
    business: AiBusinessRegistration,
    moduleId: string,
    prompt: AiBusinessRegistration['modules'][number]['prompt'],
    instanceId: string,
  ): Promise<string | undefined> {
    if (typeof prompt === 'string') return prompt.trim().length > 0 ? prompt : undefined
    if (prompt === undefined) return undefined
    const resolved = await prompt({ instanceId, businessId: business.businessId, moduleId })
    return resolved !== null && resolved.trim().length > 0 ? resolved : undefined
  }

  async function projectBusiness(business: AiBusinessRegistration, instanceId: string): Promise<AiCoreBusinessExposure> {
    const modules: AiCoreModuleExposure[] = []
    for (const module of business.modules) {
      const functions: AiCoreFunctionExposure[] = []
      for (const definition of module.getFunctions()) {
        assertId('functionId', definition.functionId)
        functions.push({
          action: actionOf(business.businessId, module.moduleId, definition.functionId),
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
      const prompt = await modulePrompt(business, module.moduleId, module.prompt, instanceId)
      modules.push({
        moduleId: module.moduleId,
        name: module.name,
        description: module.description,
        ...(prompt !== undefined ? { prompt } : {}),
        functions,
      })
    }

    return {
      businessId: business.businessId,
      name: business.name,
      description: business.description,
      status: businessStatus(business),
      modules,
    }
  }

  function flattenFunctions(business: AiCoreBusinessExposure): AiCoreFunctionExposure[] {
    return business.modules.flatMap(module => module.functions)
  }

  function buildPromptSnapshot(business: AiCoreBusinessExposure): string {
    return business.modules
      .map(module => module.prompt)
      .filter((prompt): prompt is string => prompt !== undefined && prompt.trim().length > 0)
      .join('\n\n')
  }

  function assertUniqueActions(business: AiBusinessRegistration): void {
    assertId('businessId', business.businessId)
    const moduleIds = new Set<string>()
    const actions = new Set<string>()
    for (const module of business.modules) {
      assertId('moduleId', module.moduleId)
      if (moduleIds.has(module.moduleId)) {
        throw new Error(`Duplicate module ${module.moduleId} in business ${business.businessId}`)
      }
      moduleIds.add(module.moduleId)
      for (const definition of module.getFunctions()) {
        assertId('functionId', definition.functionId)
        const action = actionOf(business.businessId, module.moduleId, definition.functionId)
        if (actions.has(action)) {
          throw new Error(`Duplicate function action in business ${business.businessId}: ${action}`)
        }
        actions.add(action)
      }
    }
  }

  function recordExposure(instance: AiCoreInstanceState): void {
    instance.history.functionExposureSnapshots.push({
      id: createRecordId('exposure'),
      timestamp: now(),
      functions: cloneExposure(instance.availableFunctions),
    })
    instance.history.version += 1
    emit(instance, 'history.functionExposure.snapshot', { total: instance.availableFunctions.length })
    emit(instance, 'functions.exposed', { business: cloneBusinessExposure(instance.business), functions: cloneExposure(instance.availableFunctions) })
  }

  function resolveFunctionCall(callOptions: AiCoreExecuteFunctionCallOptions): ResolvedFunctionCall | AiCoreFunctionCallResult {
    let address: ReturnType<typeof parseActionAddress>
    try {
      address = parseActionAddress(callOptions.action)
    } catch (error) {
      return createFailure('INVALID_ACTION', toErrorMessage(error), 'Use action format business@module@function.')
    }

    const instance = instances.get(callOptions.instanceId)
    if (instance === undefined) {
      return createFailure('UNKNOWN_INSTANCE', `Unknown AI core adapter session: ${callOptions.instanceId}`, 'Call startSession before executeFunctionCall and pass its instanceId envelope field.')
    }
    const readyFailure = assertReady(instance, callOptions.action)
    if (readyFailure !== null) return readyFailure
    if (address.business !== instance.businessId) {
      return createFailure('BUSINESS_MISMATCH', `Action ${callOptions.action} targets business ${address.business}, but adapter session ${instance.instanceId} is bound to ${instance.businessId}.`, 'Use an action from getAvailableFunctions for the same instanceId.')
    }

    const business = getBusinessOrThrow(instance.businessId)
    const businessFailure = assertBusinessReady(business)
    if (businessFailure !== null) return businessFailure

    const module = business.modules.find((candidate) => candidate.moduleId === address.module)
    if (module === undefined) {
      return createFailure('MODULE_NOT_AVAILABLE', `Module ${address.module} is not registered for business ${business.businessId}.`, 'Use a module exposed by the current business registration.')
    }

    const exposure = instance.availableFunctions.find((candidate) => candidate.action === callOptions.action)
    if (exposure === undefined) {
      return createFailure('FUNCTION_NOT_AVAILABLE', `Function ${callOptions.action} is not available for adapter session ${instance.instanceId}.`, 'Call getAvailableFunctions and choose one of the exposed actions for this instance.')
    }

    const definition = module.getFunctions().find((candidate) => candidate.functionId === address.function)
    if (definition === undefined) {
      return createFailure('FUNCTION_DEFINITION_MISSING', `Function definition ${callOptions.action} is missing from module ${address.module}.`, 'Fix the business registration so registered functions and exposed actions stay aligned.')
    }

    return { instance, business, definition, exposure }
  }

  function recordFunctionCall(instance: AiCoreInstanceState, action: AiCoreAction, args: unknown, result: AiCoreFunctionCallResult<unknown>): void {
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

  function registerBusiness(registration: AiBusinessRegistration): void {
    assertUniqueActions(registration)
    if (businesses.has(registration.businessId)) {
      throw new Error(`Duplicate AI business registration: ${registration.businessId}`)
    }
    businesses.set(registration.businessId, registration)
  }

  async function refreshInstanceExposure(instance: AiCoreInstanceState): Promise<void> {
    const business = getBusinessOrThrow(instance.businessId)
    instance.business = await projectBusiness(business, instance.instanceId)
    instance.promptSnapshot = buildPromptSnapshot(instance.business)
    instance.availableFunctions = flattenFunctions(instance.business)
  }

  async function startSession(sessionOptions: AiCoreStartSessionOptions): Promise<AiCoreStartSessionResult> {
    const business = getBusinessOrThrow(sessionOptions.businessId)
    const businessFailure = assertBusinessReady(business)
    if (businessFailure !== null && !businessFailure.ok) {
      throw new Error(businessFailure.msg)
    }
    if (sessionOptions.instanceId !== undefined) {
      const existing = getInstanceOrThrow(sessionOptions.instanceId)
      if (existing.businessId !== sessionOptions.businessId) {
        throw new Error(`Cannot resume ${sessionOptions.instanceId} as ${sessionOptions.businessId}; existing business is ${existing.businessId}`)
      }
      if (existing.status === 'Stopped' || existing.status === 'Failed') {
        throw new Error(`Cannot resume terminal adapter session ${sessionOptions.instanceId}: ${existing.status}`)
      }
      setStatus(existing, 'Resuming')
      emit(existing, 'instance.resuming', { restoreContext: sessionOptions.restoreContext })
      await refreshInstanceExposure(existing)
      recordExposure(existing)
      setStatus(existing, 'Ready')
      emit(existing, 'instance.ready', createInstanceSnapshot(existing))
      return { ...createInstanceSnapshot(existing), history: createHistorySnapshot(existing) }
    }

    const instanceId = createInstanceId(sessionOptions.businessId)
    if (instances.has(instanceId)) {
      throw new Error(`Duplicate AI core instanceId: ${instanceId}`)
    }
    const businessExposure = await projectBusiness(business, instanceId)
    const instance: AiCoreInstanceState = {
      instanceId,
      businessId: sessionOptions.businessId,
      status: 'Starting',
      business: businessExposure,
      promptSnapshot: buildPromptSnapshot(businessExposure),
      availableFunctions: flattenFunctions(businessExposure),
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
    recordExposure(instance)
    emit(instance, 'instance.started', createInstanceSnapshot(instance))
    setStatus(instance, 'Ready')
    emit(instance, 'instance.ready', createInstanceSnapshot(instance))
    return { ...createInstanceSnapshot(instance), history: createHistorySnapshot(instance) }
  }

  async function stopSession(stopOptions: AiCoreStopSessionOptions): Promise<AiCoreStopSessionResult> {
    const instance = getInstanceOrThrow(stopOptions.instanceId)
    const business = getBusinessOrThrow(instance.businessId)
    if (stopOptions.mode === 'pause') {
      if (instance.status === 'Executing') {
        instance.pendingPause = true
      } else if (instance.status !== 'Paused') {
        setStatus(instance, 'Paused', stopOptions.reason)
        emit(instance, 'instance.paused', { reason: stopOptions.reason })
      }
      return { instance: createInstanceSnapshot(instance), history: createHistorySnapshot(instance) }
    }

    if (instance.status !== 'Stopped') {
      if (instance.status === 'Executing') {
        instance.pendingStop = true
      }
      setStatus(instance, 'Stopping', stopOptions.reason)
      emit(instance, 'instance.stopping', { reason: stopOptions.reason })
      await business.releaseSession?.({ instanceId: instance.instanceId, businessId: instance.businessId })
      setStatus(instance, 'Stopped', stopOptions.reason)
      emit(instance, 'instance.stopped', { reason: stopOptions.reason })
    }
    return { instance: createInstanceSnapshot(instance), history: createHistorySnapshot(instance) }
  }

  function appendMessages(appendOptions: AiCoreAppendMessagesOptions): AiCoreHistorySnapshot {
    const instance = getInstanceOrThrow(appendOptions.instanceId)
    if (instance.status !== 'Ready') {
      throw new Error(`appendMessages requires Ready adapter session ${appendOptions.instanceId}; current status is ${instance.status}`)
    }
    for (const message of appendOptions.messages) {
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

  async function executeFunctionCall(callOptions: AiCoreExecuteFunctionCallOptions): Promise<AiCoreExecuteFunctionCallResult> {
    const resolved = resolveFunctionCall(callOptions)
    if ('ok' in resolved) {
      const instance = instances.get(callOptions.instanceId)
      return {
        result: resolved,
        history: instance ? createHistorySnapshot(instance) : {
          instanceId: callOptions.instanceId,
          version: 0,
          messages: [],
          functionCalls: [],
          lifecycleMarkers: [],
          functionExposureSnapshots: [],
        },
      }
    }

    const { instance, business, definition, exposure } = resolved
    const validationError = validateArgsBySchema(definition.paramsSchema, callOptions.args)
    if (validationError !== null) {
      const result = createFailure('INVALID_ARGS', validationError, `Use paramsSchema from getAvailableFunctions for ${callOptions.action}.`)
      recordFunctionCall(instance, callOptions.action, callOptions.args, result)
      return { result, history: createHistorySnapshot(instance) }
    }

    const executionAction = actionOf(instance.businessId, exposure.moduleId, exposure.functionId)
    const executionContext: FunctionExecutionContext = {
      instanceId: instance.instanceId,
      businessId: business.businessId,
      moduleId: exposure.moduleId,
      functionId: exposure.functionId,
      action: executionAction,
    }

    const customValidationError = definition.validate?.(callOptions.args, executionContext) ?? null
    if (customValidationError !== null) {
      const result = createFailure('INVALID_ARGS', customValidationError, `Fix args for ${callOptions.action} before retrying.`)
      recordFunctionCall(instance, callOptions.action, callOptions.args, result)
      return { result, history: createHistorySnapshot(instance) }
    }

    setStatus(instance, 'Executing')
    emit(instance, 'function.before', { action: callOptions.action, args: callOptions.args }, { moduleId: exposure.moduleId, functionId: exposure.functionId })

    let result: AiCoreFunctionCallResult<unknown>
    try {
      const executed = await definition.execute(callOptions.args, executionContext)
      if (isFunctionCallResult(executed)) {
        result = executed
      } else {
        const warnings = definition.postValidate?.(callOptions.args, executed, executionContext) ?? []
        result = {
          ok: true,
          data: executed,
          summary: `${callOptions.action} executed`,
          ...(warnings.length > 0 ? { warnings } : {}),
        }
      }
    } catch (error) {
      result = createFailure('EXECUTE_ERROR', toErrorMessage(error), `Fix ${callOptions.action} implementation or retry with valid args after checking business service state.`)
    }

    recordFunctionCall(instance, callOptions.action, callOptions.args, result)
    emit(instance, result.ok ? 'function.succeeded' : 'function.failed', { action: callOptions.action, result }, { moduleId: exposure.moduleId, functionId: exposure.functionId })
    await refreshInstanceExposure(instance)
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
    registerBusiness,
    getBusinessRegistration: (businessId) => businesses.get(businessId),
    listBusinessRegistrations: () => Array.from(businesses.values()),
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
        modules: instance.business.modules.map((module) => ({
          moduleId: module.moduleId,
          name: module.name,
          description: module.description,
          ...(module.prompt !== undefined ? { prompt: module.prompt } : {}),
          functions: cloneExposure(module.functions),
        })),
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