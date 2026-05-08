import type {
  AiBusinessRegistration,
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

/**
 * AiRuntime 内部支持模块。
 *
 * 文件按运行时处理链路排布：
 * 1. cloneRuntimeValue：所有对外快照和历史记录先深拷贝，避免外部修改内存状态。
 * 2. State/Resolved 类型：描述 runtime 私有内存状态和函数解析结果。
 * 3. AiRuntimeEventHub：负责事件序号、事件对象和订阅分发。
 * 4. AiRuntimeProjector：把业务注册定义投影成 LLM 可见 exposure。
 * 5. AiRuntimeHistory：集中写入消息、函数调用、生命周期和暴露快照。
 * 6. AiRuntimeArgValidator：运行函数前做 JSON-schema-like 的轻量参数检查。
 */

/** 深拷贝 runtime 值；优先 structuredClone，降级到 JSON clone。 */
function cloneRuntimeValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return globalThis.structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

/** 单个 runtime instance 的可变历史内存状态。 */
export interface AiRuntimeHistoryState {
  version: number
  messages: AiRuntimeHistoryMessage[]
  functionCalls: AiRuntimeFunctionCallRecord[]
  lifecycleMarkers: AiRuntimeLifecycleMarker[]
  functionExposureSnapshots: AiRuntimeFunctionExposureSnapshot[]
}

/** 单个 runtime instance 的完整可变内存状态，仅供 runtime 内部使用。 */
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

/** 函数调用解析成功后的上下文集合，供 executeFunctionCall 直接执行。 */
export interface AiRuntimeResolvedFunctionCall {
  instance: AiRuntimeInstanceState
  business: AiBusinessRegistration
  definition: AiFunctionRegistration<unknown, unknown>
  exposure: AiRuntimeFunctionExposure
}

/** runtime 事件中心：维护订阅者，并为每个实例生成单调递增事件序号。 */
export class AiRuntimeEventHub {
  private readonly listeners = new Set<AiRuntimeEventListener>()

  constructor(
    private readonly createRecordId: NonNullable<AiRuntimeOptions['createRecordId']>,
    private readonly now: NonNullable<AiRuntimeOptions['now']>,
  ) {}

  /** 构造事件、递增实例 seq，并同步通知所有订阅者。 */
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

  /** 注册事件监听器，返回取消订阅函数。监听器异常不会影响 runtime 主流程。 */
  subscribe(listener: AiRuntimeEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

/** 将业务注册定义投影成 runtime 对外快照和 LLM function exposure 的工具。 */
export class AiRuntimeProjector {
  constructor(
    private readonly actionOf: <
      TBusinessId extends string,
      TModuleId extends string,
      TFunctionId extends string,
    >(businessId: TBusinessId, moduleId: TModuleId, functionId: TFunctionId) => AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>,
    private readonly assertId: (kind: string, value: string) => void,
  ) {}

  /** 深拷贝函数暴露列表，保护 runtime 内部 availableFunctions 不被外部修改。 */
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

  /** 深拷贝模块暴露。 */
  cloneModuleExposure(module: AiRuntimeModuleExposure): AiRuntimeModuleExposure {
    return {
      moduleId: module.moduleId,
      name: module.name,
      description: module.description,
      ...(module.prompt !== undefined ? { prompt: module.prompt } : {}),
      functions: this.cloneExposure(module.functions),
    }
  }

  /** 深拷贝业务暴露。 */
  cloneBusinessExposure(business: AiRuntimeBusinessExposure): AiRuntimeBusinessExposure {
    return {
      businessId: business.businessId,
      name: business.name,
      description: business.description,
      ...(business.instanceQueryAction !== undefined ? { instanceQueryAction: business.instanceQueryAction } : {}),
      modules: business.modules.map((module) => this.cloneModuleExposure(module)),
    }
  }

  /** 创建不可变历史快照；所有嵌套 args/result/exposure 都会 clone。 */
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

  /** 创建轻量实例快照。 */
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

  /** 创建完整实例详情，包含模块暴露和历史快照。 */
  createInstanceDetail(instance: AiRuntimeInstanceState): AiRuntimeInstanceDetail {
    return {
      ...this.createInstanceSnapshot(instance),
      modules: instance.business.modules.map((module) => this.cloneModuleExposure(module)),
      history: this.createHistorySnapshot(instance),
    }
  }

  /**
   * 投影业务定义。
   *
   * 调用时序：
   * 1. 遍历业务模块和函数定义，校验 functionId。
   * 2. 组装 `business@module@function` action。
   * 3. 解析模块 prompt，生成当前实例可见的模块暴露。
   */
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
      ...(business.instanceQueryAction !== undefined ? { instanceQueryAction: business.instanceQueryAction } : {}),
      modules,
    }
  }

  /** 将业务模块树压平为当前实例可调用函数列表。 */
  flattenFunctions(business: AiRuntimeBusinessExposure): AiRuntimeFunctionExposure[] {
    return business.modules.flatMap((module) => module.functions)
  }

  /** 拼接当前实例可见的模块 prompt，生成传给 LLM 的 promptSnapshot。 */
  buildPromptSnapshot(business: AiRuntimeBusinessExposure): string {
    const parts: string[] = business.modules
      .map((module) => module.prompt)
      .filter((prompt): prompt is string => prompt !== undefined && prompt.trim().length > 0)

    if (business.instanceQueryAction !== undefined) {
      parts.push(
        `To list available instances, call \`${business.businessId}@${business.instanceQueryAction}\` (no args). Returns: Array<{ businessInstanceId: string, description: string }>. Reuse the returned businessInstanceId as #sym:businessInstanceId in subsequent business calls.`,
      )
    }

    return parts.join('\n\n')
  }

  /** 注册业务时校验 businessId、moduleId 和完整 action 是否唯一合法。 */
  assertUniqueActions(business: AiBusinessRegistration): void {
    this.assertId('businessId', business.businessId)
    const moduleIds = new Set<string>()
    const actions = new Set<string>()
    const moduleFunctionPairs = new Set<string>()
    for (const module of business.modules) {
      this.assertId('moduleId', module.moduleId)
      if (moduleIds.has(module.moduleId)) {
        throw new Error(`Duplicate module ${module.moduleId} in business ${business.businessId}`)
      }
      moduleIds.add(module.moduleId)
      for (const definition of module.getFunctions()) {
        this.assertId('functionId', definition.functionId)
        moduleFunctionPairs.add(`${module.moduleId}@${definition.functionId}`)
        const action = this.actionOf(business.businessId, module.moduleId, definition.functionId)
        if (actions.has(action)) {
          throw new Error(`Duplicate function action in business ${business.businessId}: ${action}`)
        }
        actions.add(action)
      }
    }

    if (business.instanceQueryAction !== undefined) {
      const parts = business.instanceQueryAction.split('@')
      if (parts.length !== 2) {
        throw new Error(
          `Invalid instanceQueryAction in business ${business.businessId}: ${business.instanceQueryAction}. Expected moduleId@functionId.`,
        )
      }
      const moduleId = parts[0]
      const functionId = parts[1]
      if (moduleId === undefined || functionId === undefined) {
        throw new Error(
          `Invalid instanceQueryAction in business ${business.businessId}: ${business.instanceQueryAction}. Expected moduleId@functionId.`,
        )
      }
      this.assertId('instanceQueryAction.moduleId', moduleId)
      this.assertId('instanceQueryAction.functionId', functionId)
      if (!moduleFunctionPairs.has(`${moduleId}@${functionId}`)) {
        throw new Error(
          `instanceQueryAction must point to a registered function in business ${business.businessId}: ${business.instanceQueryAction}`,
        )
      }
    }
  }

  /** 执行后或恢复实例时刷新业务投影、promptSnapshot 与函数暴露列表。 */
  async refreshInstanceExposure(instance: AiRuntimeInstanceState, business: AiBusinessRegistration): Promise<void> {
    instance.business = await this.projectBusiness(business, instance)
    instance.promptSnapshot = this.buildPromptSnapshot(instance.business)
    instance.availableFunctions = this.flattenFunctions(instance.business)
  }

  /** 解析模块 prompt：支持静态字符串和按实例动态生成函数。 */
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

/** 运行时历史写入器：所有会改变 history.version 的动作都集中在这里。 */
export class AiRuntimeHistory {
  constructor(
    private readonly createRecordId: NonNullable<AiRuntimeOptions['createRecordId']>,
    private readonly now: NonNullable<AiRuntimeOptions['now']>,
    private readonly eventHub: AiRuntimeEventHub,
    private readonly projector: AiRuntimeProjector,
  ) {}

  /** 设置实例状态，并同步写入生命周期 marker。 */
  setStatus(instance: AiRuntimeInstanceState, status: AiRuntimeInstanceStatus, reason?: string): void {
    instance.status = status
    this.markLifecycle(instance, status, reason)
  }

  /** 记录一次函数暴露快照，并发出 history 与 functions 事件。 */
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

  /** 记录一次函数调用，无论成功或失败都会写入 history。 */
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

  /** 按顺序追加聊天消息，并为每条消息发出 history.message.appended 事件。 */
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

  /** 创建当前实例历史快照。 */
  createHistorySnapshot(instance: AiRuntimeInstanceState): AiRuntimeHistorySnapshot {
    return this.projector.createHistorySnapshot(instance)
  }

  /** 写入生命周期 marker 并递增 history.version。 */
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

/** 运行函数前的轻量参数校验器，只覆盖常见 JSON schema type/required 场景。 */
export class AiRuntimeArgValidator {
  /** 根据 JSON-schema-like paramsSchema 校验 args；返回 null 表示通过。 */
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

  /** 将 schema type 字段转换成可读错误描述。 */
  private readableSchemaType(type: unknown): string {
    return Array.isArray(type) ? type.join(' | ') : String(type)
  }

  /** 判断单个值是否匹配 schema type；支持 union type 数组。 */
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

  /** 判断值是否为普通对象。 */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
