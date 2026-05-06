export type AiCoreInstanceStatus =
  | 'Starting'
  | 'Ready'
  | 'Executing'
  | 'Paused'
  | 'Resuming'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'

export type AiCoreStopMode = 'pause' | 'stop'

export type AiCoreMessageRole = 'user' | 'assistant'

export interface AiCoreAppendMessage {
  role: AiCoreMessageRole
  content: string
}

export interface AiCoreHistoryMessage extends AiCoreAppendMessage {
  id: string
  timestamp: number
}

export interface PostValidationWarning {
  rule: string
  detail: string
  fix?: string
}

export interface FunctionFailureMode {
  code: string
  when: string
  fix: string
}

export type AiCoreEventType =
  | 'instance.starting'
  | 'instance.started'
  | 'instance.ready'
  | 'instance.paused'
  | 'instance.resuming'
  | 'instance.stopping'
  | 'instance.stopped'
  | 'instance.failed'
  | 'module.starting'
  | 'module.started'
  | 'module.available'
  | 'module.stopping'
  | 'module.stopped'
  | 'functions.exposed'
  | 'function.before'
  | 'function.succeeded'
  | 'function.failed'
  | 'history.message.appended'
  | 'history.functionCall.appended'
  | 'history.functionExposure.snapshot'
  | 'warning'
  | 'error'
  | 'debug'

export interface AiCoreEvent<TPayload = unknown> {
  eventId: string
  seq: number
  timestamp: number
  type: AiCoreEventType
  businessId: string
  instanceId: string
  moduleId?: string
  functionId?: string
  causeEventId?: string
  payload: TPayload
}

export type AiCoreEventListener = (event: AiCoreEvent) => void

export interface ModuleRuntime {
  onStart?(context: ModuleRuntimeLifecycleContext): void | Promise<void>
  onStop?(context: ModuleRuntimeLifecycleContext): void | Promise<void>
  beforeExecute?(context: ModuleBeforeExecuteContext): ModuleBeforeExecuteDecision | null | Promise<ModuleBeforeExecuteDecision | null>
  afterExecute?(context: ModuleAfterExecuteContext): void | Promise<void>
  toSnapshot?(): unknown
}

export interface ModuleRuntimeReader {
  get<TRuntime extends ModuleRuntime = ModuleRuntime>(instanceId: string, moduleId: string): TRuntime | null
}

export interface ModulePromptContext {
  readonly instanceId: string
  readonly businessId: string
  readonly moduleId: string
  readonly runtimeReader: ModuleRuntimeReader
}

export interface ModuleRuntimeLifecycleContext extends ModulePromptContext {
  readonly runtime: ModuleRuntime
}

export interface IModulePromptProvider {
  getPrompt(context: ModulePromptContext): string | null | Promise<string | null>
}

export interface IModuleInstanceAccessor<TRuntime extends ModuleRuntime = ModuleRuntime> {
  getInstance(instanceId: string): TRuntime | null
}

export interface IFunctionCatalogProvider {
  getFunctions(): ReadonlyArray<IFunctionDefinition<unknown, unknown>>
}

export interface IModule<TRuntime extends ModuleRuntime = ModuleRuntime>
  extends IModulePromptProvider,
    IModuleInstanceAccessor<TRuntime>,
    IFunctionCatalogProvider {
  readonly moduleId: string
  readonly name: string
  readonly description: string
  createRuntime?(context: ModulePromptContext): TRuntime | Promise<TRuntime>
  destroyRuntime?(runtime: TRuntime, context: ModuleRuntimeLifecycleContext): void | Promise<void>
}

export interface IBusinessDefinition {
  readonly businessId: string
  readonly name: string
  readonly description: string
  readonly modules: ReadonlyArray<IModule<ModuleRuntime>>
}

export interface IFunctionDefinition<TArgs = unknown, TResult = unknown> {
  readonly functionId: string
  readonly description: string
  readonly paramsSchema: Record<string, unknown>
  readonly resultSchema?: Record<string, unknown>
  readonly maxExecutionMs?: number
  readonly usageRules?: ReadonlyArray<string>
  readonly failureModes?: ReadonlyArray<FunctionFailureMode>
  validate?(args: TArgs, context: FunctionExecutionContext): string | null
  execute(args: TArgs, context: FunctionExecutionContext): TResult | AiCoreFunctionCallResult<TResult> | Promise<TResult | AiCoreFunctionCallResult<TResult>>
  postValidate?(args: TArgs, result: TResult, context: FunctionExecutionContext): PostValidationWarning[]
}

export interface FunctionExecutionContext {
  readonly instanceId: string
  readonly businessId: string
  readonly moduleId: string
  readonly functionId: string
  readonly action: string
  readonly moduleRuntime: ModuleRuntime
  readonly runtimeReader: ModuleRuntimeReader
}

export interface ModuleBeforeExecuteContext extends FunctionExecutionContext {
  readonly args: unknown
}

export interface ModuleAfterExecuteContext extends FunctionExecutionContext {
  readonly args: unknown
  readonly result: AiCoreFunctionCallResult<unknown>
}

export type ModuleBeforeExecuteDecision =
  | { cancelled: false }
  | { cancelled: true; code?: string; msg?: string; fix?: string }

export interface AiCoreFunctionExposure {
  action: string
  businessId: string
  moduleId: string
  functionId: string
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  maxExecutionMs?: number
  usageRules?: ReadonlyArray<string>
  failureModes?: ReadonlyArray<FunctionFailureMode>
}

export type AiCoreFunctionCallResult<TResult = unknown> =
  | { ok: true; data: TResult; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

export interface AiCoreFunctionCallRecord {
  id: string
  timestamp: number
  instanceId: string
  action: string
  args: unknown
  result: AiCoreFunctionCallResult<unknown>
}

export interface AiCoreFunctionExposureSnapshot {
  id: string
  timestamp: number
  functions: ReadonlyArray<AiCoreFunctionExposure>
}

export interface AiCoreLifecycleMarker {
  id: string
  timestamp: number
  status: AiCoreInstanceStatus
  reason?: string
}

export interface AiCoreHistorySnapshot {
  instanceId: string
  version: number
  messages: ReadonlyArray<AiCoreHistoryMessage>
  functionCalls: ReadonlyArray<AiCoreFunctionCallRecord>
  lifecycleMarkers: ReadonlyArray<AiCoreLifecycleMarker>
  functionExposureSnapshots: ReadonlyArray<AiCoreFunctionExposureSnapshot>
}

export interface AiCoreInstanceSnapshot {
  instanceId: string
  businessId: string
  status: AiCoreInstanceStatus
  promptSnapshot: string
  availableFunctions: ReadonlyArray<AiCoreFunctionExposure>
}

export interface AiCoreModuleRuntimeSnapshot {
  moduleId: string
  runtime: unknown
}

export interface AiCoreInstanceDetail extends AiCoreInstanceSnapshot {
  modules: ReadonlyArray<AiCoreModuleRuntimeSnapshot>
  history: AiCoreHistorySnapshot
}

export interface AiCoreStartSessionOptions {
  businessId: string
  instanceId?: string
  restoreContext?: unknown
}

export interface AiCoreStartSessionResult extends AiCoreInstanceSnapshot {
  history: AiCoreHistorySnapshot
}

export interface AiCoreStopSessionOptions {
  instanceId: string
  mode: AiCoreStopMode
  reason?: string
}

export interface AiCoreStopSessionResult {
  instance: AiCoreInstanceSnapshot
  history: AiCoreHistorySnapshot
}

export interface AiCoreAppendMessagesOptions {
  instanceId: string
  messages: ReadonlyArray<AiCoreAppendMessage>
}

export interface AiCoreExecuteFunctionCallOptions {
  instanceId: string
  action: string
  args: unknown
}

export interface AiCoreExecuteFunctionCallResult {
  result: AiCoreFunctionCallResult<unknown>
  history: AiCoreHistorySnapshot
}

export interface AiCoreOptions {
  createInstanceId?: (businessId: string) => string
  createRecordId?: (kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure') => string
  now?: () => number
}

export interface AiCore {
  readonly runtimeReader: ModuleRuntimeReader
  registerBusiness(definition: IBusinessDefinition): void
  getBusinessDefinition(businessId: string): IBusinessDefinition | undefined
  listBusinesses(): ReadonlyArray<IBusinessDefinition>
  startSession(options: AiCoreStartSessionOptions): Promise<AiCoreStartSessionResult>
  stopSession(options: AiCoreStopSessionOptions): Promise<AiCoreStopSessionResult>
  appendMessages(options: AiCoreAppendMessagesOptions): AiCoreHistorySnapshot
  getAvailableFunctions(instanceId: string): ReadonlyArray<AiCoreFunctionExposure>
  executeFunctionCall(options: AiCoreExecuteFunctionCallOptions): Promise<AiCoreExecuteFunctionCallResult>
  listInstances(): ReadonlyArray<AiCoreInstanceSnapshot>
  getInstanceDetail(instanceId: string): AiCoreInstanceDetail | null
  getSessionHistory(instanceId: string): AiCoreHistorySnapshot | null
  subscribe(listener: AiCoreEventListener): () => void
}