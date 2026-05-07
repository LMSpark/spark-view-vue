export type AiCoreInstanceStatus =
  | 'Starting'
  | 'Ready'
  | 'Executing'
  | 'Paused'
  | 'Resuming'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'

export type AiBusinessServiceStatus = 'Ready' | 'Unavailable' | 'Failed'

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
  | 'business.registered'
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
  payload: TPayload
}

export type AiCoreEventListener = (event: AiCoreEvent) => void

export interface AiCoreSessionScope<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
> {
  readonly instanceId: string
  readonly businessId: TBusinessId
}

export interface ModulePromptContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> extends AiCoreSessionScope<TBusinessId> {
  readonly moduleId: TModuleId
}

export interface FunctionExecutionContext<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
> extends AiCoreSessionScope<TBusinessId> {
  readonly moduleId: TModuleId
  readonly functionId: TFunctionId
  readonly action: AiCoreAction<TBusinessId, TModuleId, TFunctionId>
}

export type ModulePromptProvider<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> = string | {
  bivarianceHack(context: ModulePromptContext<TBusinessId, TModuleId>): string | null | Promise<string | null>
}['bivarianceHack']

export interface AiFunctionRegistration<
  TArgs = unknown,
  TResult = unknown,
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
  TFunctionId extends AiCoreFunctionId = AiCoreFunctionId,
> {
  readonly functionId: TFunctionId
  readonly description: string
  readonly paramsSchema: Record<string, unknown>
  readonly resultSchema?: Record<string, unknown>
  readonly maxExecutionMs?: number
  readonly usageRules?: readonly string[]
  readonly failureModes?: readonly FunctionFailureMode[]
  validate?(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): string | null
  execute(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): TResult | AiCoreFunctionCallResult<TResult> | Promise<TResult | AiCoreFunctionCallResult<TResult>>
  postValidate?(args: TArgs, result: TResult, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): PostValidationWarning[]
}

export interface AiBusinessModuleRegistration<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> {
  readonly moduleId: TModuleId
  readonly name: string
  readonly description: string
  readonly prompt?: ModulePromptProvider<TBusinessId, TModuleId>
  getFunctions(): ReadonlyArray<AiFunctionRegistration<unknown, unknown, TBusinessId, TModuleId, AiCoreFunctionId>>
}

export interface AiBusinessRegistration<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModules extends ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiCoreModuleId>> = ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiCoreModuleId>>,
> {
  readonly businessId: TBusinessId
  readonly name: string
  readonly description: string
  readonly modules: TModules
  getStatus?(): AiBusinessServiceStatus
  releaseSession?(context: AiCoreSessionScope<TBusinessId>): void | Promise<void>
}

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

export interface AiCoreModuleExposure<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> {
  moduleId: TModuleId
  name: string
  description: string
  prompt?: string
  functions: ReadonlyArray<AiCoreFunctionExposure<TBusinessId, TModuleId, AiCoreFunctionId>>
}

export interface AiCoreBusinessExposure<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
> {
  businessId: TBusinessId
  name: string
  description: string
  status: AiBusinessServiceStatus
  modules: ReadonlyArray<AiCoreModuleExposure<TBusinessId, AiCoreModuleId>>
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
  business: AiCoreBusinessExposure
  promptSnapshot: string
  availableFunctions: readonly AiCoreFunctionExposure[]
}

export interface AiCoreInstanceDetail extends AiCoreInstanceSnapshot {
  modules: readonly AiCoreModuleExposure[]
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
  registerBusiness(registration: AiBusinessRegistration): void
  getBusinessRegistration(businessId: string): AiBusinessRegistration | undefined
  listBusinessRegistrations(): readonly AiBusinessRegistration[]
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