export type AiRuntimeInstanceStatus =
  | 'Starting'
  | 'Ready'
  | 'Executing'
  | 'Paused'
  | 'Resuming'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'

export type AiBusinessServiceStatus = 'Ready' | 'Unavailable' | 'Failed'

export type AiRuntimeStopMode = 'pause' | 'stop'

export type AiRuntimeMessageRole = 'user' | 'assistant'

export type AiRuntimeBusinessId = string
export type AiRuntimeBusinessInstanceId = string
export type AiRuntimeModuleId = string
export type AiRuntimeFunctionId = string
export type AiRuntimeAction<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> = `${TBusinessId}@${TModuleId}@${TFunctionId}`

export interface AiRuntimeAppendMessage {
  role: AiRuntimeMessageRole
  content: string
}

export interface AiRuntimeHistoryMessage extends AiRuntimeAppendMessage {
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

export interface AiRuntimeEvent<TPayload = unknown> {
  eventId: string
  seq: number
  timestamp: number
  type: AiRuntimeEventType
  businessId: string
  businessInstanceId: string
  instanceId: string
  moduleId?: string
  functionId?: string
  payload: TPayload
}

export type AiRuntimeEventListener = (event: AiRuntimeEvent) => void

export interface AiRuntimeInstanceScope<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TBusinessInstanceId extends AiRuntimeBusinessInstanceId = AiRuntimeBusinessInstanceId,
> {
  readonly businessInstanceId: TBusinessInstanceId
  readonly instanceId: string
  readonly businessId: TBusinessId
}

export interface ModulePromptContext<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> extends AiRuntimeInstanceScope<TBusinessId> {
  readonly moduleId: TModuleId
}

export interface FunctionExecutionContext<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> extends AiRuntimeInstanceScope<TBusinessId> {
  readonly moduleId: TModuleId
  readonly functionId: TFunctionId
  readonly action: AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>
}

export type ModulePromptProvider<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> = string | {
  bivarianceHack(context: ModulePromptContext<TBusinessId, TModuleId>): string | null | Promise<string | null>
}['bivarianceHack']

export interface AiFunctionRegistration<
  TArgs = unknown,
  TResult = unknown,
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  readonly functionId: TFunctionId
  readonly description: string
  readonly paramsSchema: Record<string, unknown>
  readonly resultSchema?: Record<string, unknown>
  readonly maxExecutionMs?: number
  readonly usageRules?: readonly string[]
  readonly failureModes?: readonly FunctionFailureMode[]
  validate?(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): string | null
  execute(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): TResult | AiRuntimeFunctionCallResult<TResult> | Promise<TResult | AiRuntimeFunctionCallResult<TResult>>
  postValidate?(args: TArgs, result: TResult, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): PostValidationWarning[]
}

export abstract class AiBusinessModuleRegistrationBase<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> {
  protected constructor(
    public readonly moduleId: TModuleId,
    public readonly name: string,
    public readonly description: string,
    public readonly prompt?: ModulePromptProvider<TBusinessId, TModuleId>,
  ) {}

  abstract getFunctions(): ReadonlyArray<AiFunctionRegistration<unknown, unknown, TBusinessId, TModuleId>>
}

export interface AiBusinessModuleRegistration<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> {
  readonly moduleId: TModuleId
  readonly name: string
  readonly description: string
  readonly prompt?: ModulePromptProvider<TBusinessId, TModuleId>
  getFunctions(): ReadonlyArray<AiFunctionRegistration<unknown, unknown, TBusinessId, TModuleId, AiRuntimeFunctionId>>
}

export abstract class AiBusinessRegistrationBase<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
> implements AiBusinessRegistration<TBusinessId> {
  public abstract readonly businessId: TBusinessId
  public abstract readonly name: string
  public abstract readonly description: string
  public abstract readonly modules: ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiRuntimeModuleId>>

  getStatus?(): AiBusinessServiceStatus {
    return 'Ready'
  }

  releaseInstance?(_context: AiRuntimeInstanceScope<TBusinessId>): void | Promise<void> {}
}

export interface AiBusinessRegistration<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModules extends ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiRuntimeModuleId>> = ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiRuntimeModuleId>>,
> {
  readonly businessId: TBusinessId
  readonly name: string
  readonly description: string
  readonly modules: TModules
  getStatus?(): AiBusinessServiceStatus
  releaseInstance?(context: AiRuntimeInstanceScope<TBusinessId>): void | Promise<void>
}

export interface AiRuntimeFunctionExposure<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  action: AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>
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

export interface AiRuntimeModuleExposure<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> {
  moduleId: TModuleId
  name: string
  description: string
  prompt?: string
  functions: ReadonlyArray<AiRuntimeFunctionExposure<TBusinessId, TModuleId, AiRuntimeFunctionId>>
}

export interface AiRuntimeBusinessExposure<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
> {
  businessId: TBusinessId
  name: string
  description: string
  status: AiBusinessServiceStatus
  modules: ReadonlyArray<AiRuntimeModuleExposure<TBusinessId, AiRuntimeModuleId>>
}

export type AiRuntimeFunctionCallResult<TResult = unknown> =
  | { ok: true; data: TResult; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

export interface AiRuntimeFunctionCallRecord<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  id: string
  timestamp: number
  instanceId: string
  action: AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>
  args: unknown
  result: AiRuntimeFunctionCallResult<unknown>
}

export interface AiRuntimeFunctionExposureSnapshot<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  id: string
  timestamp: number
  functions: ReadonlyArray<AiRuntimeFunctionExposure<TBusinessId, TModuleId, TFunctionId>>
}

export interface AiRuntimeLifecycleMarker {
  id: string
  timestamp: number
  status: AiRuntimeInstanceStatus
  reason?: string
}

export interface AiRuntimeHistorySnapshot {
  instanceId: string
  businessId: string
  businessInstanceId: string
  version: number
  messages: readonly AiRuntimeHistoryMessage[]
  functionCalls: readonly AiRuntimeFunctionCallRecord[]
  lifecycleMarkers: readonly AiRuntimeLifecycleMarker[]
  functionExposureSnapshots: readonly AiRuntimeFunctionExposureSnapshot[]
}

export interface AiRuntimeInstanceSnapshot {
  instanceId: string
  businessInstanceId: string
  businessId: string
  status: AiRuntimeInstanceStatus
  business: AiRuntimeBusinessExposure
  promptSnapshot: string
  availableFunctions: readonly AiRuntimeFunctionExposure[]
}

export interface AiRuntimeInstanceDetail extends AiRuntimeInstanceSnapshot {
  modules: readonly AiRuntimeModuleExposure[]
  history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeStartInstanceOptions {
  businessId: string
  businessInstanceId: string
  restoreContext?: unknown
}

export interface AiRuntimeStartInstanceResult extends AiRuntimeInstanceSnapshot {
  history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeStopInstanceOptions {
  instanceId: string
  mode: AiRuntimeStopMode
  reason?: string
}

export interface AiRuntimeStopInstanceResult {
  instance: AiRuntimeInstanceSnapshot
  history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeAppendMessagesOptions {
  instanceId: string
  messages: readonly AiRuntimeAppendMessage[]
}

export interface AiRuntimeExecuteFunctionCallOptions {
  instanceId: string
  action: AiRuntimeAction
  args: unknown
}

export interface AiRuntimeExecuteFunctionCallResult {
  result: AiRuntimeFunctionCallResult<unknown>
  history: AiRuntimeHistorySnapshot
}

export interface AiRuntimeOptions {
  createInstanceId?: (businessId: string, businessInstanceId: string) => string
  createRecordId?: (kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure') => string
  now?: () => number
}

export interface AiRuntimeApi {
  registerBusiness(registration: AiBusinessRegistration): void
  getBusinessRegistration(businessId: string): AiBusinessRegistration | undefined
  listBusinessRegistrations(): readonly AiBusinessRegistration[]
  startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult>
  stopInstance(options: AiRuntimeStopInstanceOptions): Promise<AiRuntimeStopInstanceResult>
  appendMessages(options: AiRuntimeAppendMessagesOptions): AiRuntimeHistorySnapshot
  getAvailableFunctions(instanceId: string): readonly AiRuntimeFunctionExposure[]
  executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeExecuteFunctionCallResult>
  listInstances(): readonly AiRuntimeInstanceSnapshot[]
  getInstanceDetail(instanceId: string): AiRuntimeInstanceDetail | null
  getInstanceHistory(instanceId: string): AiRuntimeHistorySnapshot | null
  subscribe(listener: AiRuntimeEventListener): () => void
}
