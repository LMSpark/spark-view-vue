import type {
  AiFunctionRegistration,
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiRuntimeAction,
  AiRuntimeActivePathSnapshot,
  AiRuntimeAppendMessagesOptions,
  AiRuntimeEvent,
  AiRuntimeEventListener,
  AiRuntimeEventType,
  AiRuntimeFunctionCallRecord,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionExposureSnapshot,
  AiRuntimeHistoryMessage,
  AiRuntimeHistorySnapshot,
  AiRuntimeInstanceDetail,
  AiRuntimeInstanceScope,
  AiRuntimeInstanceSnapshot,
  AiRuntimeInstanceStatus,
  AiRuntimeLifecycleMarker,
  AiRuntimeModuleExposure,
  AiRuntimeModuleInstanceId,
  AiRuntimeOptions,
} from '../protocol/business-contracts'

/**
 * AiRuntime 内部支持模块。
 *
 * 这里集中处理快照 clone、事件、模块树投影、历史写入和轻量参数校验。
 */

function cloneRuntimeValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return globalThis.structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  moduleId: string
  moduleInstanceId: AiRuntimeModuleInstanceId
  status: AiRuntimeInstanceStatus
  module: AiRuntimeModuleExposure
  promptSnapshot: string
  availableFunctions: AiRuntimeFunctionExposure[]
  activePath: AiModuleInstanceBinding[]
  history: AiRuntimeHistoryState
  seq: number
  pendingPause: boolean
  pendingStop: boolean
}

export interface AiRuntimeResolvedFunctionCall {
  instance: AiRuntimeInstanceState
  module: AiModuleRegistration
  definition: AiFunctionRegistration
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
    details: { actionModulePath?: string; functionId?: string } = {},
  ): AiRuntimeEvent {
    instance.seq += 1
    const event: AiRuntimeEvent = {
      eventId: this.createRecordId('event'),
      seq: instance.seq,
      timestamp: this.now(),
      type,
      moduleId: instance.moduleId,
      moduleInstanceId: instance.moduleInstanceId,
      instanceId: instance.instanceId,
      ...(details.actionModulePath !== undefined ? { actionModulePath: details.actionModulePath } : {}),
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

interface ProjectModuleOptions {
  module: AiModuleRegistration
  instanceScope: AiRuntimeInstanceScope
  parentIds: readonly string[]
  parentContextParams: readonly AiRuntimeFunctionContextParam[]
}

export class AiRuntimeProjector {
  constructor(
    private readonly actionOf: (modulePath: string, functionId: string) => AiRuntimeAction,
    private readonly assertId: (kind: string, value: string) => void,
  ) {}

  cloneExposure(functions: readonly AiRuntimeFunctionExposure[]): AiRuntimeFunctionExposure[] {
    return functions.map((item) => ({
      action: item.action,
      moduleId: item.moduleId,
      modulePath: item.modulePath,
      moduleIds: [...item.moduleIds],
      functionId: item.functionId,
      description: item.description,
      paramsSchema: cloneRuntimeValue(item.paramsSchema),
      ...(item.resultSchema !== undefined ? { resultSchema: cloneRuntimeValue(item.resultSchema) } : {}),
      ...(item.maxExecutionMs !== undefined ? { maxExecutionMs: item.maxExecutionMs } : {}),
      ...(item.usageRules !== undefined ? { usageRules: [...item.usageRules] } : {}),
      ...(item.failureModes !== undefined ? { failureModes: item.failureModes.map((mode) => ({ ...mode })) } : {}),
      contextParams: item.contextParams.map((param) => ({ ...param })),
    }))
  }

  cloneModuleExposure(module: AiRuntimeModuleExposure): AiRuntimeModuleExposure {
    return {
      moduleId: module.moduleId,
      modulePath: module.modulePath,
      moduleIds: [...module.moduleIds],
      name: module.name,
      description: module.description,
      ...(module.prompt !== undefined ? { prompt: module.prompt } : {}),
      ...(module.instanceParam !== undefined ? { instanceParam: { ...module.instanceParam } } : {}),
      functions: this.cloneExposure(module.functions),
      modules: module.modules.map((child) => this.cloneModuleExposure(child)),
    }
  }

  createHistorySnapshot(instance: AiRuntimeInstanceState): AiRuntimeHistorySnapshot {
    return {
      instanceId: instance.instanceId,
      moduleId: instance.moduleId,
      moduleInstanceId: instance.moduleInstanceId,
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

  createActivePathSnapshot(instance: AiRuntimeInstanceState): AiRuntimeActivePathSnapshot {
    return {
      instanceId: instance.instanceId,
      bindings: instance.activePath.map((binding) => ({ ...binding })),
      moduleInstances: this.moduleInstancesFromBindings(instance.activePath),
    }
  }

  createInstanceSnapshot(instance: AiRuntimeInstanceState): AiRuntimeInstanceSnapshot {
    return {
      instanceId: instance.instanceId,
      moduleInstanceId: instance.moduleInstanceId,
      moduleId: instance.moduleId,
      status: instance.status,
      module: this.cloneModuleExposure(instance.module),
      promptSnapshot: instance.promptSnapshot,
      availableFunctions: this.cloneExposure(instance.availableFunctions),
      activePath: this.createActivePathSnapshot(instance),
    }
  }

  createInstanceDetail(instance: AiRuntimeInstanceState): AiRuntimeInstanceDetail {
    return {
      ...this.createInstanceSnapshot(instance),
      history: this.createHistorySnapshot(instance),
    }
  }

  async projectModule(
    module: AiModuleRegistration,
    instanceScope: AiRuntimeInstanceScope,
  ): Promise<AiRuntimeModuleExposure> {
    return this.projectModuleNode({
      module,
      instanceScope,
      parentIds: [],
      parentContextParams: [],
    })
  }

  flattenFunctions(module: AiRuntimeModuleExposure): AiRuntimeFunctionExposure[] {
    return [
      ...module.functions,
      ...module.modules.flatMap((child) => this.flattenFunctions(child)),
    ]
  }

  buildPromptSnapshot(module: AiRuntimeModuleExposure): string {
    const parts: string[] = []
    this.collectPrompts(module, parts)
    return parts.join('\n\n')
  }

  assertUniqueActions(module: AiModuleRegistration): void {
    this.assertId('moduleId', module.moduleId)
    const modulePaths = new Set<string>()
    const actions = new Set<string>()
    this.collectRegistrationActions(module, [], modulePaths, actions)
  }

  async refreshInstanceExposure(instance: AiRuntimeInstanceState, module: AiModuleRegistration): Promise<void> {
    instance.module = await this.projectModule(module, this.createScope(instance))
    instance.promptSnapshot = this.buildPromptSnapshot(instance.module)
    instance.availableFunctions = this.flattenFunctions(instance.module)
  }

  moduleInstancesFromBindings(bindings: readonly AiModuleInstanceBinding[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const binding of bindings) {
      if (binding.paramName !== undefined && binding.paramName.trim().length > 0) {
        out[binding.paramName] = binding.instanceId
      }
    }
    return out
  }

  private async projectModuleNode(options: ProjectModuleOptions): Promise<AiRuntimeModuleExposure> {
    const { module, instanceScope, parentIds, parentContextParams } = options
    const moduleIds = [...parentIds, module.moduleId]
    const modulePath = moduleIds.join('/')
    const currentContextParam = module.instanceParam === undefined
      ? null
      : {
          modulePath,
          moduleId: module.moduleId,
          paramName: module.instanceParam.name,
          description: module.instanceParam.description,
        } satisfies AiRuntimeFunctionContextParam

    const functions = module.getFunctions().map((definition) => {
      this.assertId('functionId', definition.functionId)
      const contextParams = definition.scope === 'instance' && currentContextParam !== null
        ? [...parentContextParams, currentContextParam]
        : [...parentContextParams]
      return {
        action: this.actionOf(modulePath, definition.functionId),
        moduleId: module.moduleId,
        modulePath,
        moduleIds,
        functionId: definition.functionId,
        description: definition.description,
        paramsSchema: this.injectContextParamsSchema(definition.paramsSchema, contextParams),
        ...(definition.resultSchema !== undefined ? { resultSchema: definition.resultSchema } : {}),
        ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
        ...(definition.usageRules !== undefined ? { usageRules: definition.usageRules } : {}),
        ...(definition.failureModes !== undefined ? { failureModes: definition.failureModes } : {}),
        contextParams,
      } satisfies AiRuntimeFunctionExposure
    })

    const prompt = await this.modulePrompt(modulePath, module.prompt, instanceScope, moduleIds)
    const childParentParams = currentContextParam === null
      ? parentContextParams
      : [...parentContextParams, currentContextParam]
    const modules: AiRuntimeModuleExposure[] = []
    for (const child of module.modules ?? []) {
      modules.push(await this.projectModuleNode({
        module: child,
        instanceScope,
        parentIds: moduleIds,
        parentContextParams: childParentParams,
      }))
    }

    return {
      moduleId: module.moduleId,
      modulePath,
      moduleIds,
      name: module.name,
      description: module.description,
      ...(prompt !== undefined ? { prompt } : {}),
      ...(module.instanceParam !== undefined ? { instanceParam: module.instanceParam } : {}),
      functions,
      modules,
    }
  }

  private injectContextParamsSchema(
    schema: Record<string, unknown>,
    contextParams: readonly AiRuntimeFunctionContextParam[],
  ): Record<string, unknown> {
    if (contextParams.length === 0) return cloneRuntimeValue(schema)

    const cloned = cloneRuntimeValue(schema)
    if (cloned['type'] === 'object') {
      const properties = isRecord(cloned['properties']) ? { ...cloned['properties'] } : {}
      const required = Array.isArray(cloned['required'])
        ? cloned['required'].filter((key): key is string => typeof key === 'string')
        : []
      for (const param of contextParams) {
        properties[param.paramName] = {
          type: 'string',
          description: `${param.description}（模块路径: ${param.modulePath}）`,
        }
        if (!required.includes(param.paramName)) required.push(param.paramName)
      }
      return {
        ...cloned,
        type: 'object',
        properties,
        required,
      }
    }

    const simplified = { ...cloned }
    for (const param of contextParams) {
      simplified[param.paramName] = `string — ${param.description}（模块路径: ${param.modulePath}）`
    }
    return simplified
  }

  private collectPrompts(module: AiRuntimeModuleExposure, parts: string[]): void {
    if (module.prompt !== undefined && module.prompt.trim().length > 0) {
      parts.push(module.prompt)
    }
    for (const child of module.modules) {
      this.collectPrompts(child, parts)
    }
  }

  private collectRegistrationActions(
    module: AiModuleRegistration,
    parentIds: readonly string[],
    modulePaths: Set<string>,
    actions: Set<string>,
  ): void {
    this.assertId('moduleId', module.moduleId)
    const moduleIds = [...parentIds, module.moduleId]
    const modulePath = moduleIds.join('/')
    if (modulePaths.has(modulePath)) {
      throw new Error(`Duplicate module path: ${modulePath}`)
    }
    modulePaths.add(modulePath)

    if (module.instanceParam !== undefined) {
      this.assertId(`instanceParam ${modulePath}`, module.instanceParam.name)
    }

    const functionIds = new Set<string>()
    for (const definition of module.getFunctions()) {
      this.assertId('functionId', definition.functionId)
      if (functionIds.has(definition.functionId)) {
        throw new Error(`Duplicate function ${definition.functionId} in module ${modulePath}`)
      }
      functionIds.add(definition.functionId)
      const action = this.actionOf(modulePath, definition.functionId)
      if (actions.has(action)) {
        throw new Error(`Duplicate function action: ${action}`)
      }
      actions.add(action)
    }

    for (const child of module.modules ?? []) {
      this.collectRegistrationActions(child, moduleIds, modulePaths, actions)
    }
  }

  private async modulePrompt(
    modulePath: string,
    prompt: AiModuleRegistration['prompt'],
    instanceScope: AiRuntimeInstanceScope,
    moduleIds: readonly string[],
  ): Promise<string | undefined> {
    if (typeof prompt === 'string') return prompt.trim().length > 0 ? prompt : undefined
    if (prompt === undefined) return undefined
    const resolved = await prompt({ ...instanceScope, modulePath, moduleIds })
    return resolved !== null && resolved.trim().length > 0 ? resolved : undefined
  }

  private createScope(instance: AiRuntimeInstanceState): AiRuntimeInstanceScope {
    return {
      instanceId: instance.instanceId,
      runtimeInstanceId: instance.instanceId,
      moduleId: instance.moduleId,
      moduleInstanceId: instance.moduleInstanceId,
    }
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
      module: this.projector.cloneModuleExposure(instance.module),
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
    return isRecord(value)
  }
}
