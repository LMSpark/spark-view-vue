/**
 * AI Runtime 模块契约总览。
 *
 * 核心层只定义模块树、函数暴露、运行时实例、事件与历史。模块可以递归包含模块，
 * 所有层级都统一称为模块；函数是模块树叶子上的可调用能力。
 */

// =========================================================
// 一、基础状态、ID 与 action 路径
// =========================================================

export type AiRuntimeInstanceStatus =
  | 'Starting'
  | 'Ready'
  | 'Executing'
  | 'Paused'
  | 'Resuming'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'

export type AiRuntimeStopMode = 'pause' | 'stop'

export type AiRuntimeMessageRole = 'user' | 'assistant'

export type AiRuntimeModuleId = string

export type AiRuntimeModuleInstanceId = string

export type AiRuntimeModulePath = string

export type AiRuntimeFunctionId = string

/** LLM 调用函数时使用的路径地址，例如 `department/personnel/basicInfo/update`。 */
export type AiRuntimeAction = string

// =========================================================
// 二、消息、警告、失败模式与事件
// =========================================================

export interface AiRuntimeAppendMessage {
  readonly role: AiRuntimeMessageRole
  readonly content: string
}

export interface AiRuntimeHistoryMessage extends AiRuntimeAppendMessage {
  readonly id: string
  readonly timestamp: number
}

export interface PostValidationWarning {
  readonly rule: string
  readonly detail: string
  readonly fix?: string
}

export interface FunctionFailureMode {
  readonly code: string
  readonly when: string
  readonly fix: string
}

export type AiRuntimeEventType =
  | 'instance.starting'
  | 'instance.started'
  | 'instance.ready'
  | 'instance.paused'
  | 'instance.resuming'
  | 'instance.stopping'
  | 'instance.stopped'
  | 'instance.failed'
  | 'functions.exposed'
  | 'function.before'
  | 'function.succeeded'
  | 'function.failed'
  | 'history.message.appended'
  | 'history.functionCall.appended'
  | 'history.functionExposure.snapshot'
  | 'activePath.updated'

export interface AiRuntimeEvent<TPayload = unknown> {
  readonly eventId: string
  readonly seq: number
  readonly timestamp: number
  readonly type: AiRuntimeEventType
  /** 顶层模块 ID。 */
  readonly moduleId: string
  /** 调用方提供的顶层模块实例 ID。 */
  readonly moduleInstanceId: string
  /** runtime 生成的技术实例 ID。 */
  readonly instanceId: string
  /** 函数调用关联的模块路径。 */
  readonly actionModulePath?: string
  /** 函数调用关联的函数 ID。 */
  readonly functionId?: string
  readonly payload: TPayload
}

export type AiRuntimeEventListener = (event: AiRuntimeEvent) => void

// =========================================================
// 三、运行时上下文与模块注册契约
// =========================================================

export interface AiRuntimeInstanceScope {
  /** 顶层模块实例 ID，由调用方提供。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /** runtime 生成的技术实例 ID。 */
  readonly instanceId: string
  /** 与 instanceId 相同，给函数上下文使用更明确的名字。 */
  readonly runtimeInstanceId: string
  /** 顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
}

export interface AiRuntimeModuleInstanceScope {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
}

export interface AiModuleInstanceParam {
  /** LLM 参数字段名，例如 departmentId、personId。 */
  readonly name: string
  /** 面向 LLM 的实例 ID 说明。 */
  readonly description: string
}

export interface AiModuleInstanceBinding {
  /** 绑定对应的模块路径，例如 department/personnel。 */
  readonly modulePath: AiRuntimeModulePath
  /** 该模块当前选中的实例 ID。 */
  readonly instanceId: AiRuntimeModuleInstanceId
  /** 可选字段名；省略时由模块注册的 instanceParam 推导。 */
  readonly paramName?: string
}

export interface AiRuntimeActivePathSnapshot {
  readonly instanceId: string
  readonly bindings: readonly AiModuleInstanceBinding[]
  /** 便于函数实现读取的字段名到实例 ID 映射。 */
  readonly moduleInstances: Readonly<Record<string, string>>
}

export interface ModulePromptContext extends AiRuntimeInstanceScope {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
}

export interface FunctionExecutionContext extends AiRuntimeInstanceScope {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly functionId: AiRuntimeFunctionId
  readonly action: AiRuntimeAction
  readonly moduleInstances: Readonly<Record<string, string>>
  readonly activePath: AiRuntimeActivePathSnapshot
}

export type ModulePromptProvider = string | {
  bivarianceHack(context: ModulePromptContext): string | null | Promise<string | null>
}['bivarianceHack']

export interface AiFunctionRegistration {
  readonly functionId: AiRuntimeFunctionId
  readonly description: string
  readonly paramsSchema: Record<string, unknown>
  readonly resultSchema?: Record<string, unknown> | undefined
  readonly maxExecutionMs?: number | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  /**
   * collection: 需要上层模块实例 ID。
   * instance: 需要上层模块实例 ID，并额外需要当前模块自己的 instanceParam。
   */
  readonly scope?: 'collection' | 'instance'
  validate?(args: unknown, context: FunctionExecutionContext): string | null
  execute(args: unknown, context: FunctionExecutionContext): object | AiRuntimeFunctionCallResult<unknown> | Promise<object | AiRuntimeFunctionCallResult<unknown>>
  postValidate?(args: unknown, result: unknown, context: FunctionExecutionContext): PostValidationWarning[]
}

export abstract class AiModuleRegistrationBase implements AiModuleRegistration {
  protected constructor(
    public readonly moduleId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly prompt?: ModulePromptProvider,
    public readonly modules: readonly AiModuleRegistration[] = [],
    public readonly instanceParam?: AiModuleInstanceParam,
  ) {}

  abstract getFunctions(): readonly AiFunctionRegistration[]

  releaseInstance?(_context: AiRuntimeInstanceScope): void | Promise<void> {}
}

export interface AiModuleRegistration {
  readonly moduleId: AiRuntimeModuleId
  readonly name: string
  readonly description: string
  readonly prompt?: ModulePromptProvider | undefined
  readonly modules?: readonly AiModuleRegistration[] | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  getFunctions(): readonly AiFunctionRegistration[]
  releaseInstance?(context: AiRuntimeInstanceScope): void | Promise<void>
}

// =========================================================
// 四、投影给 LLM 的模块与函数暴露结构
// =========================================================

export interface AiRuntimeFunctionContextParam {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleId: AiRuntimeModuleId
  readonly paramName: string
  readonly description: string
}

export interface AiRuntimeFunctionExposure {
  readonly action: AiRuntimeAction
  readonly moduleId: AiRuntimeModuleId
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly functionId: AiRuntimeFunctionId
  readonly description: string
  readonly paramsSchema: Record<string, unknown>
  readonly resultSchema?: Record<string, unknown> | undefined
  readonly maxExecutionMs?: number | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  readonly contextParams: readonly AiRuntimeFunctionContextParam[]
}

export interface AiRuntimeModuleExposure {
  readonly moduleId: AiRuntimeModuleId
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly name: string
  readonly description: string
  readonly prompt?: string | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  readonly functions: readonly AiRuntimeFunctionExposure[]
  readonly modules: readonly AiRuntimeModuleExposure[]
}

// =========================================================
// 五、函数调用结果、历史记录与实例快照
// =========================================================

export type AiRuntimeFunctionCallResult<TResult = unknown> =
  | { ok: true; data: TResult; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

export interface AiRuntimeFunctionCallRecord {
  readonly id: string
  readonly timestamp: number
  readonly instanceId: string
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

export interface AiRuntimeFunctionExposureSnapshot {
  readonly id: string
  readonly timestamp: number
  readonly functions: readonly AiRuntimeFunctionExposure[]
}

export interface AiRuntimeLifecycleMarker {
  readonly id: string
  readonly timestamp: number
  readonly status: AiRuntimeInstanceStatus
  readonly reason?: string
}

export interface AiRuntimeHistorySnapshot {
  readonly instanceId: string
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly version: number
  readonly messages: readonly AiRuntimeHistoryMessage[]
  readonly functionCalls: readonly AiRuntimeFunctionCallRecord[]
  readonly lifecycleMarkers: readonly AiRuntimeLifecycleMarker[]
  readonly functionExposureSnapshots: readonly AiRuntimeFunctionExposureSnapshot[]
}

export interface AiRuntimeInstanceSnapshot {
  readonly instanceId: string
  readonly moduleInstanceId: string
  readonly moduleId: string
  readonly status: AiRuntimeInstanceStatus
  readonly module: AiRuntimeModuleExposure
  readonly promptSnapshot: string
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
  readonly activePath: AiRuntimeActivePathSnapshot
}

export interface AiRuntimeInstanceDetail extends AiRuntimeInstanceSnapshot {
  readonly history: AiRuntimeHistorySnapshot
}

// =========================================================
// 六、实例操作参数与公共 Runtime API
// =========================================================

export interface AiRuntimeStartInstanceOptions {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly restoreContext?: unknown
}

export interface AiRuntimeStartInstanceResult extends AiRuntimeInstanceSnapshot {
  readonly history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeStopInstanceOptions {
  readonly instanceId: string
  readonly mode: AiRuntimeStopMode
  readonly reason?: string
}

export interface AiRuntimeStopModuleInstanceOptions extends AiRuntimeModuleInstanceScope {
  readonly mode: AiRuntimeStopMode
  readonly reason?: string
}

export interface AiRuntimeStopInstanceResult {
  readonly instance: AiRuntimeInstanceSnapshot
  readonly history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeAppendMessagesOptions {
  readonly instanceId: string
  readonly messages: readonly AiRuntimeAppendMessage[]
}

export interface AiRuntimeExecuteFunctionCallOptions {
  readonly instanceId: string
  readonly action: AiRuntimeAction
  readonly args: unknown
}

export interface AiRuntimeExecuteFunctionCallResult {
  readonly result: AiRuntimeFunctionCallResult<unknown>
  readonly history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeSetActivePathOptions {
  readonly instanceId: string
  readonly bindings: readonly AiModuleInstanceBinding[]
}

export interface AiRuntimeClearActivePathOptions {
  readonly instanceId: string
  /** 为空时清空所有宿主设置的活动路径；可传 modulePath 或 paramName 精确清理。 */
  readonly keys?: readonly string[]
}

export interface AiRuntimeOptions {
  createInstanceId?: (moduleId: string, moduleInstanceId: string) => string
  createRecordId?: (kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure') => string
  now?: () => number
}

export interface AiRuntimeApi {
  registerModule(registration: AiModuleRegistration): void
  getModuleRegistration(moduleId: string): AiModuleRegistration | undefined
  listModuleRegistrations(): readonly AiModuleRegistration[]
  startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult>
  stopInstance(options: AiRuntimeStopInstanceOptions): Promise<AiRuntimeStopInstanceResult>
  stopInstanceByModuleScope(options: AiRuntimeStopModuleInstanceOptions): Promise<AiRuntimeStopInstanceResult>
  appendMessages(options: AiRuntimeAppendMessagesOptions): AiRuntimeHistorySnapshot
  getAvailableFunctions(instanceId: string): readonly AiRuntimeFunctionExposure[]
  executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeExecuteFunctionCallResult>
  setActivePath(options: AiRuntimeSetActivePathOptions): AiRuntimeActivePathSnapshot
  clearActivePath(options: AiRuntimeClearActivePathOptions): AiRuntimeActivePathSnapshot
  getActivePath(instanceId: string): AiRuntimeActivePathSnapshot
  listInstances(): readonly AiRuntimeInstanceSnapshot[]
  getInstanceDetail(instanceId: string): AiRuntimeInstanceDetail | null
  getInstanceHistory(instanceId: string): AiRuntimeHistorySnapshot | null
  getInstanceByModuleScope(scope: AiRuntimeModuleInstanceScope): AiRuntimeInstanceSnapshot | null
  getInstanceHistoryByModuleScope(scope: AiRuntimeModuleInstanceScope): AiRuntimeHistorySnapshot | null
  subscribe(listener: AiRuntimeEventListener): () => void
}
