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

export type AiCoreBusinessId = string
export type AiCoreModuleId = string
export type AiCoreFunctionId = string
export type AiCoreAction<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
> = `${TBusinessId}@${TModuleId}@${TFunctionId}`

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

export interface ModulePromptContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> {
  readonly instanceId: string
  readonly businessId: TBusinessId
  readonly moduleId: TModuleId
  readonly runtimeReader: ModuleRuntimeReader
}

export interface ModuleRuntimeLifecycleContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TRuntime extends ModuleRuntime = ModuleRuntime,
> extends ModulePromptContext<TBusinessId, TModuleId> {
  readonly runtime: TRuntime
}

export interface IModulePromptProvider<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> {
  getPrompt(context: ModulePromptContext<TBusinessId, TModuleId>): string | null | Promise<string | null>
}

export interface IModuleInstanceAccessor<TRuntime extends ModuleRuntime = ModuleRuntime> {
  getInstance(instanceId: string): TRuntime | null
}

export interface IFunctionCatalogProvider<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TRuntime extends ModuleRuntime = ModuleRuntime,
> {
  getFunctions(): ReadonlyArray<IFunctionDefinition<unknown, unknown, TBusinessId, TModuleId, AiCoreFunctionId, TRuntime>>
}

export interface IModule<
  TRuntime extends ModuleRuntime = ModuleRuntime,
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
>
  extends IModulePromptProvider<TBusinessId, TModuleId>,
    IModuleInstanceAccessor<TRuntime>,
    IFunctionCatalogProvider<TBusinessId, TModuleId, TRuntime> {
  readonly moduleId: TModuleId
  readonly name: string
  readonly description: string
  createRuntime?(context: ModulePromptContext<TBusinessId, TModuleId>): TRuntime | Promise<TRuntime>
  destroyRuntime?(runtime: TRuntime, context: ModuleRuntimeLifecycleContext<TBusinessId, TModuleId>): void | Promise<void>
}

export interface IBusinessDefinition<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModules extends ReadonlyArray<IModule<ModuleRuntime, TBusinessId, AiCoreModuleId>> = ReadonlyArray<IModule<ModuleRuntime, TBusinessId, AiCoreModuleId>>,
> {
  readonly businessId: TBusinessId
  readonly name: string
  readonly description: string
  readonly modules: TModules
}

export interface IFunctionDefinition<
  TArgs = unknown,
  TResult = unknown,
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
  TRuntime extends ModuleRuntime = ModuleRuntime,
> {
  readonly functionId: TFunctionId
  readonly description: string
  readonly paramsSchema: Record<string, unknown>
  readonly resultSchema?: Record<string, unknown>
  readonly maxExecutionMs?: number
  readonly usageRules?: readonly string[]
  readonly failureModes?: readonly FunctionFailureMode[]
  validate?(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId, TRuntime>): string | null
  execute(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId, TRuntime>): TResult | AiCoreFunctionCallResult<TResult> | Promise<TResult | AiCoreFunctionCallResult<TResult>>
  postValidate?(args: TArgs, result: TResult, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId, TRuntime>): PostValidationWarning[]
}

export interface FunctionExecutionContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
  TRuntime extends ModuleRuntime = ModuleRuntime,
> {
  readonly instanceId: string
  readonly businessId: TBusinessId
  readonly moduleId: TModuleId
  readonly functionId: TFunctionId
  readonly action: AiCoreAction<TBusinessId, TModuleId, TFunctionId>
  readonly moduleRuntime: TRuntime
  readonly runtimeReader: ModuleRuntimeReader
}

export interface ModuleBeforeExecuteContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
  TRuntime extends ModuleRuntime = ModuleRuntime,
> extends FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId, TRuntime> {
  readonly args: unknown
}

export interface ModuleAfterExecuteContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
  TRuntime extends ModuleRuntime = ModuleRuntime,
> extends FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId, TRuntime> {
  readonly args: unknown
  readonly result: AiCoreFunctionCallResult<unknown>
}

export type ModuleBeforeExecuteDecision =
  | { cancelled: false }
  | { cancelled: true; code?: string; msg?: string; fix?: string }

export interface AiCoreFunctionExposure<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
> {
  action: AiCoreAction<TBusinessId, TModuleId, TFunctionId>
  businessId: TBusinessId
  moduleId: TModuleId
  functionId: TFunctionId
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  maxExecutionMs?: number
  usageRules?: readonly string[]
  failureModes?: readonly FunctionFailureMode[]
}

export type AiCoreFunctionCallResult<TResult = unknown> =
  | { ok: true; data: TResult; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

export interface AiCoreFunctionCallRecord<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
> {
  id: string
  timestamp: number
  instanceId: string
  action: AiCoreAction<TBusinessId, TModuleId, TFunctionId>
  args: unknown
  result: AiCoreFunctionCallResult<unknown>
}

export interface AiCoreFunctionExposureSnapshot<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
> {
  id: string
  timestamp: number
  functions: ReadonlyArray<AiCoreFunctionExposure<TBusinessId, TModuleId, TFunctionId>>
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
  messages: readonly AiCoreHistoryMessage[]
  functionCalls: readonly AiCoreFunctionCallRecord[]
  lifecycleMarkers: readonly AiCoreLifecycleMarker[]
  functionExposureSnapshots: readonly AiCoreFunctionExposureSnapshot[]
}

export interface AiCoreInstanceSnapshot {
  instanceId: string
  businessId: string
  status: AiCoreInstanceStatus
  promptSnapshot: string
  availableFunctions: readonly AiCoreFunctionExposure[]
}

export interface AiCoreModuleRuntimeSnapshot {
  moduleId: string
  runtime: unknown
}

export interface AiCoreInstanceDetail extends AiCoreInstanceSnapshot {
  modules: readonly AiCoreModuleRuntimeSnapshot[]
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
  messages: readonly AiCoreAppendMessage[]
}

export interface AiCoreExecuteFunctionCallOptions {
  instanceId: string
  action: AiCoreAction
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
  listBusinesses(): readonly IBusinessDefinition[]
  startSession(options: AiCoreStartSessionOptions): Promise<AiCoreStartSessionResult>
  stopSession(options: AiCoreStopSessionOptions): Promise<AiCoreStopSessionResult>
  appendMessages(options: AiCoreAppendMessagesOptions): AiCoreHistorySnapshot
  getAvailableFunctions(instanceId: string): readonly AiCoreFunctionExposure[]
  executeFunctionCall(options: AiCoreExecuteFunctionCallOptions): Promise<AiCoreExecuteFunctionCallResult>
  listInstances(): readonly AiCoreInstanceSnapshot[]
  getInstanceDetail(instanceId: string): AiCoreInstanceDetail | null
  getSessionHistory(instanceId: string): AiCoreHistorySnapshot | null
  subscribe(listener: AiCoreEventListener): () => void
}