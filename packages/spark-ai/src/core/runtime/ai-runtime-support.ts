import type {
  AiBusinessRegistration,
  AiBusinessServiceStatus,
  AiRuntimeAction,
  AiRuntimeAppendMessagesOptions,
  AiRuntimeBusinessExposure,
  AiRuntimeEvent,
  AiRuntimeEventListener,
  AiRuntimeEventType,
  AiRuntimeFunctionCallRecord,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionExposureSnapshot,
  AiRuntimeHistoryMessage,
  AiRuntimeHistorySnapshot,
  AiRuntimeInstanceDetail,
  AiRuntimeInstanceSnapshot,
  AiRuntimeInstanceStatus,
  AiRuntimeLifecycleMarker,
  AiRuntimeModuleExposure,
  AiRuntimeOptions,
  AiRuntimeInstanceScope,
  AiFunctionRegistration,
  AiRuntimeBusinessInstanceId,
} from '../protocol/business-contracts'

function cloneRuntimeValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return globalThis.structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

export interface AiRuntimeHistoryState {
  version: number
  messages: AiRuntimeHistoryMessage[]
  functionCalls: AiRuntimeFunctionCallRecord[]
  lifecycleMarkers: AiRuntimeLifecycleMarker[]
  functionExposureSnapshots: AiRuntimeFunctionExposureSnapshot[]
}

export interface AiRuntimeInstanceState {
  instanceId: string
  businessId: string
  businessInstanceId: AiRuntimeBusinessInstanceId
  status: AiRuntimeInstanceStatus
  business: AiRuntimeBusinessExposure
  promptSnapshot: string
  availableFunctions: AiRuntimeFunctionExposure[]
  history: AiRuntimeHistoryState
  seq: number
  pendingPause: boolean
  pendingStop: boolean
}

export interface AiRuntimeResolvedFunctionCall {
  instance: AiRuntimeInstanceState
  business: AiBusinessRegistration
  definition: AiFunctionRegistration<unknown, unknown>
  exposure: AiRuntimeFunctionExposure
}

export class AiRuntimeEventHub {
  private readonly listeners = new Set<AiRuntimeEventListener>()

  constructor(
    private readonly createRecordId: NonNullable<AiRuntimeOptions['createRecordId']>,
    private readonly now: NonNullable<AiRuntimeOptions['now']>,
  ) {}

  emit(
    instance: AiRuntimeInstanceState,
    type: AiRuntimeEventType,
    payload: unknown,
    details: { moduleId?: string; functionId?: string } = {},
  ): AiRuntimeEvent {
    instance.seq += 1
    const event: AiRuntimeEvent = {
      eventId: this.createRecordId('event'),
      seq: instance.seq,
      timestamp: this.now(),
      type,
      businessId: instance.businessId,
      businessInstanceId: instance.businessInstanceId,
      instanceId: instance.instanceId,
      ...(details.moduleId !== undefined ? { moduleId: details.moduleId } : {}),
      ...(details.functionId !== undefined ? { functionId: details.functionId } : {}),
      payload,
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Event listeners are observational only.
      }
    }
    return event
  }

  subscribe(listener: AiRuntimeEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export class AiRuntimeProjector {
  constructor(
    private readonly actionOf: <
      TBusinessId extends string,
      TModuleId extends string,
      TFunctionId extends string,
    >(businessId: TBusinessId, moduleId: TModuleId, functionId: TFunctionId) => AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>,
    private readonly assertId: (kind: string, value: string) => void,
  ) {}

  businessStatus(business: AiBusinessRegistration): AiBusinessServiceStatus {
    return business.getStatus?.() ?? 'Ready'
  }

  cloneExposure(functions: readonly AiRuntimeFunctionExposure[]): AiRuntimeFunctionExposure[] {
    return functions.map((item) => ({
      action: item.action,
      businessId: item.businessId,
      moduleId: item.moduleId,
      functionId: item.functionId,
      description: item.description,
      paramsSchema: cloneRuntimeValue(item.paramsSchema),
      ...(item.resultSchema !== undefined ? { resultSchema: cloneRuntimeValue(item.resultSchema) } : {}),
      ...(item.maxExecutionMs !== undefined ? { maxExecutionMs: item.maxExecutionMs } : {}),
      ...(item.usageRules !== undefined ? { usageRules: [...item.usageRules] } : {}),
      ...(item.failureModes !== undefined ? { failureModes: item.failureModes.map((mode) => ({ ...mode })) } : {}),
    }))
  }

  cloneModuleExposure(module: AiRuntimeModuleExposure): AiRuntimeModuleExposure {
    return {
      moduleId: module.moduleId,
      name: module.name,
      description: module.description,
      ...(module.prompt !== undefined ? { prompt: module.prompt } : {}),
      functions: this.cloneExposure(module.functions),
    }
  }

  cloneBusinessExposure(business: AiRuntimeBusinessExposure): AiRuntimeBusinessExposure {
    return {
      businessId: business.businessId,
      name: business.name,
      description: business.description,
      status: business.status,
      modules: business.modules.map((module) => this.cloneModuleExposure(module)),
    }
  }

  createHistorySnapshot(instance: AiRuntimeInstanceState): AiRuntimeHistorySnapshot {
    return {
      instanceId: instance.instanceId,
      businessId: instance.businessId,
      businessInstanceId: instance.businessInstanceId,
      version: instance.history.version,
      messages: instance.history.messages.map((message) => ({ ...message })),
      functionCalls: instance.history.functionCalls.map((call) => ({
        ...call,
        args: cloneRuntimeValue(call.args),
        result: cloneRuntimeValue(call.result),
      })),
      lifecycleMarkers: instance.history.lifecycleMarkers.map((marker) => ({ ...marker })),
      functionExposureSnapshots: instance.history.functionExposureSnapshots.map((snapshot) => ({
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        functions: this.cloneExposure(snapshot.functions),
      })),
    }
  }

  createInstanceSnapshot(instance: AiRuntimeInstanceState): AiRuntimeInstanceSnapshot {
    return {
      instanceId: instance.instanceId,
      businessInstanceId: instance.businessInstanceId,
      businessId: instance.businessId,
      status: instance.status,
      business: this.cloneBusinessExposure(instance.business),
      promptSnapshot: instance.promptSnapshot,
      availableFunctions: this.cloneExposure(instance.availableFunctions),
    }
  }

  createInstanceDetail(instance: AiRuntimeInstanceState): AiRuntimeInstanceDetail {
    return {
      ...this.createInstanceSnapshot(instance),
      modules: instance.business.modules.map((module) => this.cloneModuleExposure(module)),
      history: this.createHistorySnapshot(instance),
    }
  }

  async projectBusiness(
    business: AiBusinessRegistration,
    instanceScope: AiRuntimeInstanceScope,
  ): Promise<AiRuntimeBusinessExposure> {
    const modules: AiRuntimeModuleExposure[] = []
    for (const module of business.modules) {
      const functions: AiRuntimeFunctionExposure[] = []
      for (const definition of module.getFunctions()) {
        this.assertId('functionId', definition.functionId)
        functions.push({
          action: this.actionOf(business.businessId, module.moduleId, definition.functionId),
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

      const prompt = await this.modulePrompt(module.moduleId, module.prompt, instanceScope)
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
      status: this.businessStatus(business),
      modules,
    }
  }

  flattenFunctions(business: AiRuntimeBusinessExposure): AiRuntimeFunctionExposure[] {
    return business.modules.flatMap((module) => module.functions)
  }

  buildPromptSnapshot(business: AiRuntimeBusinessExposure): string {
    return business.modules
      .map((module) => module.prompt)
      .filter((prompt): prompt is string => prompt !== undefined && prompt.trim().length > 0)
      .join('\n\n')
  }

  assertUniqueActions(business: AiBusinessRegistration): void {
    this.assertId('businessId', business.businessId)
    const moduleIds = new Set<string>()
    const actions = new Set<string>()
    for (const module of business.modules) {
      this.assertId('moduleId', module.moduleId)
      if (moduleIds.has(module.moduleId)) {
        throw new Error(`Duplicate module ${module.moduleId} in business ${business.businessId}`)
      }
      moduleIds.add(module.moduleId)
      for (const definition of module.getFunctions()) {
        this.assertId('functionId', definition.functionId)
        const action = this.actionOf(business.businessId, module.moduleId, definition.functionId)
        if (actions.has(action)) {
          throw new Error(`Duplicate function action in business ${business.businessId}: ${action}`)
        }
        actions.add(action)
      }
    }
  }

  async refreshInstanceExposure(instance: AiRuntimeInstanceState, business: AiBusinessRegistration): Promise<void> {
    instance.business = await this.projectBusiness(business, instance)
    instance.promptSnapshot = this.buildPromptSnapshot(instance.business)
    instance.availableFunctions = this.flattenFunctions(instance.business)
  }

  private async modulePrompt(
    moduleId: string,
    prompt: AiBusinessRegistration['modules'][number]['prompt'],
    instanceScope: AiRuntimeInstanceScope,
  ): Promise<string | undefined> {
    if (typeof prompt === 'string') return prompt.trim().length > 0 ? prompt : undefined
    if (prompt === undefined) return undefined
    const resolved = await prompt({ ...instanceScope, moduleId })
    return resolved !== null && resolved.trim().length > 0 ? resolved : undefined
  }
}

export class AiRuntimeHistory {
  constructor(
    private readonly createRecordId: NonNullable<AiRuntimeOptions['createRecordId']>,
    private readonly now: NonNullable<AiRuntimeOptions['now']>,
    private readonly eventHub: AiRuntimeEventHub,
    private readonly projector: AiRuntimeProjector,
  ) {}

  setStatus(instance: AiRuntimeInstanceState, status: AiRuntimeInstanceStatus, reason?: string): void {
    instance.status = status
    this.markLifecycle(instance, status, reason)
  }

  recordExposure(instance: AiRuntimeInstanceState): void {
    instance.history.functionExposureSnapshots.push({
      id: this.createRecordId('exposure'),
      timestamp: this.now(),
      functions: this.projector.cloneExposure(instance.availableFunctions),
    })
    instance.history.version += 1
    this.eventHub.emit(instance, 'history.functionExposure.snapshot', { total: instance.availableFunctions.length })
    this.eventHub.emit(instance, 'functions.exposed', {
      business: this.projector.cloneBusinessExposure(instance.business),
      functions: this.projector.cloneExposure(instance.availableFunctions),
    })
  }

  recordFunctionCall(
    instance: AiRuntimeInstanceState,
    action: AiRuntimeAction,
    args: unknown,
    result: AiRuntimeFunctionCallResult<unknown>,
  ): void {
    instance.history.functionCalls.push({
      id: this.createRecordId('functionCall'),
      timestamp: this.now(),
      instanceId: instance.instanceId,
      action,
      args: cloneRuntimeValue(args),
      result: cloneRuntimeValue(result),
    })
    instance.history.version += 1
    this.eventHub.emit(instance, 'history.functionCall.appended', { action, result })
  }

  appendMessages(instance: AiRuntimeInstanceState, options: AiRuntimeAppendMessagesOptions): AiRuntimeHistorySnapshot {
    for (const message of options.messages) {
      instance.history.messages.push({
        id: this.createRecordId('message'),
        timestamp: this.now(),
        role: message.role,
        content: message.content,
      })
      instance.history.version += 1
      this.eventHub.emit(instance, 'history.message.appended', { role: message.role })
    }
    return this.projector.createHistorySnapshot(instance)
  }

  createHistorySnapshot(instance: AiRuntimeInstanceState): AiRuntimeHistorySnapshot {
    return this.projector.createHistorySnapshot(instance)
  }

  private markLifecycle(instance: AiRuntimeInstanceState, status: AiRuntimeInstanceStatus, reason?: string): void {
    instance.history.lifecycleMarkers.push({
      id: this.createRecordId('lifecycle'),
      timestamp: this.now(),
      status,
      ...(reason !== undefined ? { reason } : {}),
    })
    instance.history.version += 1
  }
}

export class AiRuntimeArgValidator {
  validateArgsBySchema(schema: Record<string, unknown>, args: unknown): string | null {
    if (Object.keys(schema).length === 0) return null
    if (schema['type'] !== 'object') return null
    if (!this.isRecord(args)) return 'args must be an object'

    const required = Array.isArray(schema['required'])
      ? schema['required'].filter((key): key is string => typeof key === 'string')
      : []
    for (const key of required) {
      if (!(key in args) || args[key] === undefined) {
        return `missing required arg: ${key}`
      }
    }

    const properties = this.isRecord(schema['properties']) ? schema['properties'] : {}
    for (const [key, property] of Object.entries(properties)) {
      if (!(key in args) || args[key] === undefined || !this.isRecord(property) || property['type'] === undefined) continue
      if (!this.matchesSchemaType(args[key], property['type'])) {
        return `arg ${key} must be ${this.readableSchemaType(property['type'])}`
      }
    }

    return null
  }

  private readableSchemaType(type: unknown): string {
    return Array.isArray(type) ? type.join(' | ') : String(type)
  }

  private matchesSchemaType(value: unknown, type: unknown): boolean {
    const types = Array.isArray(type) ? type : [type]
    for (const candidate of types) {
      if (candidate === 'null' && value === null) return true
      if (candidate === 'array' && Array.isArray(value)) return true
      if (candidate === 'object' && this.isRecord(value)) return true
      if (candidate === 'string' && typeof value === 'string') return true
      if (candidate === 'number' && typeof value === 'number') return true
      if (candidate === 'integer' && Number.isInteger(value)) return true
      if (candidate === 'boolean' && typeof value === 'boolean') return true
    }
    return false
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
