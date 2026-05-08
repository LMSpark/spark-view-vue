/**
 * AI Runtime 业务契约总览。
 *
 * 推荐阅读时序：
 * 1. 基础枚举与 ID 类型：先理解实例状态与 action 地址格式。
 * 2. 消息与事件：理解运行时如何记录对话、生命周期和函数调用变化。
 * 3. 业务注册：业务层通过 business/module/function 三层结构声明可调用能力。
 * 4. 运行时投影：runtime 把注册定义转换为 LLM 可见的 function exposure。
 * 5. 历史与快照：所有对外查询都返回不可变快照，避免外部修改内存状态。
 * 6. 操作参数与 API：start、append、execute、stop 串成完整实例生命周期。
 */

// =========================================================
// 一、基础状态、ID 与 action 地址
// =========================================================

/**
 * 单个 LLM 可见运行时实例的生命周期状态。
 *
 * 一个 runtime instance 总是绑定到一个已注册业务和一个调用方提供的
 * businessInstanceId，例如一次页面编辑会话或一次用户任务。
 */
export type AiRuntimeInstanceStatus =
  | 'Starting'
  | 'Ready'
  | 'Executing'
  | 'Paused'
  | 'Resuming'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'

/**
 * 停止实例时的行为模式。
 *
 * - `pause`: 保留实例，可后续 resume。
 * - `stop` : 释放业务层资源，并把实例推进到终态。
 */
export type AiRuntimeStopMode = 'pause' | 'stop'

/** 写入 runtime history 的消息角色。 */
export type AiRuntimeMessageRole = 'user' | 'assistant'

/** 已注册 AI 业务的稳定 ID，会出现在 action 第一段。 */
export type AiRuntimeBusinessId = string

/** 调用方提供的业务会话 ID，例如页面 ID、编辑会话 ID 或任务 ID。 */
export type AiRuntimeBusinessInstanceId = string

/** 单个业务注册内部的稳定模块 ID，会出现在 action 第二段。 */
export type AiRuntimeModuleId = string

/** 单个模块内部可调用函数的稳定 ID，会出现在 action 第三段。 */
export type AiRuntimeFunctionId = string

/**
 * 暴露给 LLM 的完整函数地址。
 *
 * runtime 会解析该格式，将调用路由到已注册的 business、module 和 function。
 */
export type AiRuntimeAction<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> = `${TBusinessId}@${TModuleId}@${TFunctionId}`

// =========================================================
// 二、消息、警告、失败模式与事件
// =========================================================

/** `appendMessages` 接收的消息载荷。 */
export interface AiRuntimeAppendMessage {
  /** 消息说话方。 */
  readonly role: AiRuntimeMessageRole
  /** 持久化到 runtime history 的纯文本内容。 */
  readonly content: string
}

/** 已持久化消息，带 runtime 生成的 ID 和时间戳。 */
export interface AiRuntimeHistoryMessage extends AiRuntimeAppendMessage {
  /** runtime 生成的消息记录 ID。 */
  readonly id: string
  /** runtime 时钟生成的毫秒时间戳。 */
  readonly timestamp: number
}

/** 函数成功后检测到的非致命问题。 */
export interface PostValidationWarning {
  /** 触发 warning 的规则名或稳定标识。 */
  readonly rule: string
  /** 人类可读的问题细节。 */
  readonly detail: string
  /** 给调用方或 LLM 的可选修复建议。 */
  readonly fix?: string
}

/** 函数定义中声明的已知失败模式。 */
export interface FunctionFailureMode {
  /** 函数可能返回或描述的稳定错误码。 */
  readonly code: string
  /** 失败触发条件。 */
  readonly when: string
  /** 推荐恢复动作。 */
  readonly fix: string
}

/** runtime event hub 发出的事件名。 */
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

/** 生命周期、函数调用、历史变更产生的 runtime 事件。 */
export interface AiRuntimeEvent<TPayload = unknown> {
  /** runtime 生成的事件记录 ID。 */
  readonly eventId: string
  /** 单个 runtime instance 内单调递增的序号。 */
  readonly seq: number
  /** runtime 时钟生成的毫秒时间戳。 */
  readonly timestamp: number
  /** 事件类别。 */
  readonly type: AiRuntimeEventType
  /** 拥有该 runtime instance 的业务 ID。 */
  readonly businessId: string
  /** 调用方提供的业务会话 ID。 */
  readonly businessInstanceId: string
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 事件关联模块；仅函数级或模块级事件存在。 */
  readonly moduleId?: string
  /** 事件关联函数；仅函数级事件存在。 */
  readonly functionId?: string
  /** 事件专属载荷。 */
  readonly payload: TPayload
}

/** `AiRuntimeApi.subscribe` 使用的观察者回调。 */
export type AiRuntimeEventListener = (event: AiRuntimeEvent) => void

// =========================================================
// 三、运行时上下文与业务注册契约
// =========================================================

/**
 * 传给业务 hook 与函数实现的完整 runtime scope。
 *
 * 同时包含调用方可识别的 businessInstanceId 与 runtime 生成的 instanceId，
 * 便于业务代码关联外部状态和内部运行时状态。
 */
export interface AiRuntimeInstanceScope<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TBusinessInstanceId extends AiRuntimeBusinessInstanceId = AiRuntimeBusinessInstanceId,
> {
  /** 调用方提供的业务会话 ID。 */
  readonly businessInstanceId: TBusinessInstanceId
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 拥有该 runtime instance 的业务 ID。 */
  readonly businessId: TBusinessId
}

/**
 * 面向调用方的实例定位 scope。
 *
 * 当调用方不知道 runtime 生成的 `instanceId` 时，可用这一对业务 ID 重新定位实例。
 */
export interface AiRuntimeBusinessInstanceScope<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TBusinessInstanceId extends AiRuntimeBusinessInstanceId = AiRuntimeBusinessInstanceId,
> {
  /** 已注册业务 ID。 */
  readonly businessId: TBusinessId
  /** 调用方提供的业务会话 ID。 */
  readonly businessInstanceId: TBusinessInstanceId
}

/** 解析某个 runtime instance 的模块 prompt 时传入的上下文。 */
export interface ModulePromptContext<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> extends AiRuntimeInstanceScope<TBusinessId> {
  /** 正在解析 prompt 的模块 ID。 */
  readonly moduleId: TModuleId
}

/** 执行或校验注册函数时传入的上下文。 */
export interface FunctionExecutionContext<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> extends AiRuntimeInstanceScope<TBusinessId> {
  /** 拥有该函数的模块 ID。 */
  readonly moduleId: TModuleId
  /** 正在被调用的函数 ID。 */
  readonly functionId: TFunctionId
  /** 调用方使用的完整 action 地址。 */
  readonly action: AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>
}

/**
 * 模块 prompt 提供者，支持静态字符串或按实例动态生成。
 *
 * 返回 `null` 或空白文本时，该模块 prompt 不会进入实例 promptSnapshot。
 */
export type ModulePromptProvider<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> = string | {
  bivarianceHack(context: ModulePromptContext<TBusinessId, TModuleId>): string | null | Promise<string | null>
}['bivarianceHack']

/** 业务模块注册的函数定义。 */
export interface AiFunctionRegistration<
  TArgs = unknown,
  TResult = unknown,
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  /** 模块内稳定函数 ID。 */
  readonly functionId: TFunctionId
  /** 面向 LLM 的函数能力描述。 */
  readonly description: string
  /** JSON-schema-like 参数描述，用于轻量参数校验和工具说明生成。 */
  readonly paramsSchema: Record<string, unknown>
  /** 可选返回值 schema，供调用方或 catalog UI 展示。 */
  readonly resultSchema?: Record<string, unknown>
  /** 可选执行预算，作为调用方规划和 UI 展示信息。 */
  readonly maxExecutionMs?: number
  /** 面向 LLM 的使用约束、前置条件或调用顺序规则。 */
  readonly usageRules?: readonly string[]
  /** 已知失败模式，帮助 LLM 预判和修复。 */
  readonly failureModes?: readonly FunctionFailureMode[]
  /**
   * `execute` 前的可选业务校验。
   *
   * 返回字符串表示拒绝本次调用，runtime 会归一化为 `INVALID_ARGS` 失败。
   */
  validate?(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): string | null
  /**
   * 执行函数主体。
   *
   * 实现可以返回原始数据、结构化成功结果，或结构化失败结果。
   */
  execute(args: TArgs, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): TResult | AiRuntimeFunctionCallResult<TResult> | Promise<TResult | AiRuntimeFunctionCallResult<TResult>>
  /** 成功后的可选校验器，可附加非致命 warning。 */
  postValidate?(args: TArgs, result: TResult, context: FunctionExecutionContext<TBusinessId, TModuleId, TFunctionId>): PostValidationWarning[]
}

/** 模块注册便捷基类：固定 module metadata，只要求子类提供函数列表。 */
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

  /** 返回该模块当前暴露的函数列表；业务可按状态动态调整。 */
  abstract getFunctions(): ReadonlyArray<AiFunctionRegistration<unknown, unknown, TBusinessId, TModuleId>>
}

/** runtime projector 消费的模块注册结构。 */
export interface AiBusinessModuleRegistration<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> {
  /** 业务内稳定模块 ID。 */
  readonly moduleId: TModuleId
  /** 人类可读模块名。 */
  readonly name: string
  /** 面向 LLM 的模块说明。 */
  readonly description: string
  /** 可选静态或按实例生成的模块 prompt。 */
  readonly prompt?: ModulePromptProvider<TBusinessId, TModuleId>
  /** 返回该模块当前暴露的函数列表。 */
  getFunctions(): ReadonlyArray<AiFunctionRegistration<unknown, unknown, TBusinessId, TModuleId, AiRuntimeFunctionId>>
}

/**
 * LLM 调用 instanceQueryAction 函数时返回的单条业务实例摘要。
 *
 * 业务层的 instanceQueryAction 函数应返回此类型数组，
 * LLM 据此获知可用的 businessInstanceId 后再发起业务操作。
 */
export interface AiBusinessInstanceSummary {
  /** 调用方提供的业务实例 ID。 */
  readonly businessInstanceId: string
  /** 面向 LLM 的实例描述，如用户姓名、请假原因或任务标题。 */
  readonly description: string
}

/** 业务注册便捷基类：业务层继承后声明基础 metadata 和模块列表。 */
export abstract class AiBusinessRegistrationBase<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
> implements AiBusinessRegistration<TBusinessId> {
  /** runtime action 第一段使用的稳定业务 ID。 */
  public abstract readonly businessId: TBusinessId
  /** 人类可读业务名。 */
  public abstract readonly name: string
  /** 面向 LLM 的业务说明。 */
  public abstract readonly description: string
  /** 该业务暴露的模块列表。 */
  public abstract readonly modules: ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiRuntimeModuleId>>

  /** 释放停止实例时业务层持有的资源。 */
  releaseInstance?(_context: AiRuntimeInstanceScope<TBusinessId>): void | Promise<void> {}
}

/** `AiRuntime.registerBusiness` 消费的业务注册结构。 */
export interface AiBusinessRegistration<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModules extends ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiRuntimeModuleId>> = ReadonlyArray<AiBusinessModuleRegistration<TBusinessId, AiRuntimeModuleId>>,
> {
  /** runtime action 第一段使用的稳定业务 ID。 */
  readonly businessId: TBusinessId
  /** 人类可读业务名。 */
  readonly name: string
  /** 面向 LLM 的业务说明。 */
  readonly description: string
  /** 该业务暴露的模块列表。 */
  readonly modules: TModules
  /**
   * 查询业务实例列表的函数地址（格式：`模块ID@函数ID`）。
   *
   * 声明后核心层会在 promptSnapshot 中自动注入调用提示，让 LLM 通过
   * `{businessId}@{instanceQueryAction}` 获取可用实例列表，
   * 再以 businessInstanceId 作为 args 发起后续业务操作。
   * 对应函数应返回 `AiBusinessInstanceSummary[]`。
   * 约束：除该实例查询函数外，同业务下所有 `business@module@function`
   * 调用都必须在 args 中携带 `businessInstanceId`。
   */
  readonly instanceQueryAction?: `${string}@${string}`
  /** 释放停止实例时业务层持有的资源。 */
  releaseInstance?(context: AiRuntimeInstanceScope<TBusinessId>): void | Promise<void>
}

// =========================================================
// 四、投影给 LLM 的业务、模块与函数暴露结构
// =========================================================

/** 从注册函数投影出来、面向 LLM 的函数 metadata。 */
export interface AiRuntimeFunctionExposure<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  /** 调用函数时使用的完整 action 地址。 */
  readonly action: AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>
  /** 拥有该函数的业务 ID。 */
  readonly businessId: TBusinessId
  /** 拥有该函数的模块 ID。 */
  readonly moduleId: TModuleId
  /** 模块内函数 ID。 */
  readonly functionId: TFunctionId
  /** 面向 LLM 的函数说明。 */
  readonly description: string
  /** JSON-schema-like 参数 schema。 */
  readonly paramsSchema: Record<string, unknown>
  /** 可选 JSON-schema-like 结果 schema。 */
  readonly resultSchema?: Record<string, unknown>
  /** 可选执行预算。 */
  readonly maxExecutionMs?: number
  /** 面向 LLM 的使用约束与调用顺序规则。 */
  readonly usageRules?: readonly string[]
  /** LLM 可据此规划修复的已知失败模式。 */
  readonly failureModes?: readonly FunctionFailureMode[]
}

/** 为某个 runtime instance 投影出的模块 metadata。 */
export interface AiRuntimeModuleExposure<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
> {
  /** 稳定模块 ID。 */
  readonly moduleId: TModuleId
  /** 人类可读模块名。 */
  readonly name: string
  /** 面向 LLM 的模块说明。 */
  readonly description: string
  /** 当前实例解析后的模块 prompt。 */
  readonly prompt?: string
  /** 当前模块可调用函数。 */
  readonly functions: ReadonlyArray<AiRuntimeFunctionExposure<TBusinessId, TModuleId, AiRuntimeFunctionId>>
}

/** 为某个 runtime instance 投影出的业务 metadata。 */
export interface AiRuntimeBusinessExposure<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
> {
  /** 稳定业务 ID。 */
  readonly businessId: TBusinessId
  /** 人类可读业务名。 */
  readonly name: string
  /** 面向 LLM 的业务说明。 */
  readonly description: string
  /**
   * 查询业务实例列表的函数地址（格式：`模块ID@函数ID`）。
   * 存在时 promptSnapshot 中会自动注入实例查询提示。
   */
  readonly instanceQueryAction?: `${string}@${string}`
  /** 当前业务暴露的模块列表。 */
  readonly modules: ReadonlyArray<AiRuntimeModuleExposure<TBusinessId, AiRuntimeModuleId>>
}

// =========================================================
// 五、函数调用结果、历史记录与实例快照
// =========================================================

/** 持久化到 runtime history 的结构化函数执行结果。 */
export type AiRuntimeFunctionCallResult<TResult = unknown> =
  | { ok: true; data: TResult; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

/** 单次函数调用尝试的持久化记录。 */
export interface AiRuntimeFunctionCallRecord<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  /** runtime 生成的调用记录 ID。 */
  readonly id: string
  /** runtime 时钟生成的毫秒时间戳。 */
  readonly timestamp: number
  /** 执行本次调用的 runtime instance ID。 */
  readonly instanceId: string
  /** 被调用的完整 action 地址。 */
  readonly action: AiRuntimeAction<TBusinessId, TModuleId, TFunctionId>
  /** runtime clone 后保存的原始参数载荷。 */
  readonly args: unknown
  /** 函数返回结果或 runtime 归一化失败。 */
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

/** runtime instance 某一时刻的函数暴露快照。 */
export interface AiRuntimeFunctionExposureSnapshot<
  TBusinessId extends AiRuntimeBusinessId = AiRuntimeBusinessId,
  TModuleId extends AiRuntimeModuleId = AiRuntimeModuleId,
  TFunctionId extends AiRuntimeFunctionId = AiRuntimeFunctionId,
> {
  /** runtime 生成的暴露快照 ID。 */
  readonly id: string
  /** runtime 时钟生成的毫秒时间戳。 */
  readonly timestamp: number
  /** 此历史时刻可见的函数列表。 */
  readonly functions: ReadonlyArray<AiRuntimeFunctionExposure<TBusinessId, TModuleId, TFunctionId>>
}

/** 持久化的生命周期状态迁移记录。 */
export interface AiRuntimeLifecycleMarker {
  /** runtime 生成的生命周期记录 ID。 */
  readonly id: string
  /** runtime 时钟生成的毫秒时间戳。 */
  readonly timestamp: number
  /** 本条 marker 记录的状态。 */
  readonly status: AiRuntimeInstanceStatus
  /** 可选状态迁移原因。 */
  readonly reason?: string
}

/** 返回给调用方的不可变 runtime history 快照。 */
export interface AiRuntimeHistorySnapshot {
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 拥有该 runtime instance 的业务 ID。 */
  readonly businessId: string
  /** 调用方提供的业务会话 ID。 */
  readonly businessInstanceId: string
  /** 每次持久化变更都会递增的历史版本。 */
  readonly version: number
  /** 已追加的聊天消息。 */
  readonly messages: readonly AiRuntimeHistoryMessage[]
  /** 函数调用记录。 */
  readonly functionCalls: readonly AiRuntimeFunctionCallRecord[]
  /** 生命周期状态迁移记录。 */
  readonly lifecycleMarkers: readonly AiRuntimeLifecycleMarker[]
  /** 函数暴露快照列表。 */
  readonly functionExposureSnapshots: readonly AiRuntimeFunctionExposureSnapshot[]
}

/** 列表与查询 API 返回的轻量 runtime instance 视图。 */
export interface AiRuntimeInstanceSnapshot {
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 调用方提供的业务会话 ID。 */
  readonly businessInstanceId: string
  /** 拥有该 runtime instance 的业务 ID。 */
  readonly businessId: string
  /** 当前生命周期状态。 */
  readonly status: AiRuntimeInstanceStatus
  /** 当前实例投影出的业务 metadata。 */
  readonly business: AiRuntimeBusinessExposure
  /** 最近一次投影时解析并拼接的模块 prompt。 */
  readonly promptSnapshot: string
  /** 当前实例可调用函数列表。 */
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
}

/** 完整 runtime instance 视图，包含模块暴露和历史快照。 */
export interface AiRuntimeInstanceDetail extends AiRuntimeInstanceSnapshot {
  /** 当前实例投影出的模块列表。 */
  readonly modules: readonly AiRuntimeModuleExposure[]
  /** 不可变历史快照。 */
  readonly history: AiRuntimeHistorySnapshot
}

// =========================================================
// 六、实例操作参数与公共 Runtime API
// =========================================================

/** 创建或恢复业务域 runtime instance 的参数。 */
export interface AiRuntimeStartInstanceOptions {
  /** 已注册业务 ID。 */
  readonly businessId: string
  /** 调用方提供的业务会话 ID；同一 pair 重复调用会恢复现有实例。 */
  readonly businessInstanceId: string
  /** 可选恢复上下文，会透传到 resume 事件。 */
  readonly restoreContext?: unknown
}

/** `startInstance` 返回值。 */
export interface AiRuntimeStartInstanceResult extends AiRuntimeInstanceSnapshot {
  /** start 或 resume 完成后的历史快照。 */
  readonly history: AiRuntimeHistorySnapshot
}

/** 通过 runtime 生成 ID 停止实例的参数。 */
export interface AiRuntimeStopInstanceOptions {
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 暂停或终止停止模式。 */
  readonly mode: AiRuntimeStopMode
  /** 可选原因，会写入生命周期 marker。 */
  readonly reason?: string
}

/** 通过业务 scope 停止实例的参数。 */
export interface AiRuntimeStopBusinessInstanceOptions extends AiRuntimeBusinessInstanceScope {
  /** 暂停或终止停止模式。 */
  readonly mode: AiRuntimeStopMode
  /** 可选原因，会写入生命周期 marker。 */
  readonly reason?: string
}

/** stop 与 pause 操作返回值。 */
export interface AiRuntimeStopInstanceResult {
  /** 操作完成后的实例快照。 */
  readonly instance: AiRuntimeInstanceSnapshot
  /** 操作完成后的历史快照。 */
  readonly history: AiRuntimeHistorySnapshot
}

/** 向活跃 runtime instance 追加聊天消息的参数。 */
export interface AiRuntimeAppendMessagesOptions {
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 按顺序追加的消息。 */
  readonly messages: readonly AiRuntimeAppendMessage[]
}

/** 调用一个已暴露函数的参数。 */
export interface AiRuntimeExecuteFunctionCallOptions {
  /** runtime 生成的实例 ID。 */
  readonly instanceId: string
  /** 来自 `getAvailableFunctions` 的完整 action 地址。 */
  readonly action: AiRuntimeAction
  /** 传给函数的参数载荷。 */
  readonly args: unknown
}

/** `executeFunctionCall` 返回值。 */
export interface AiRuntimeExecuteFunctionCallResult {
  /** 函数结果或 runtime 归一化失败。 */
  readonly result: AiRuntimeFunctionCallResult<unknown>
  /** 调用记录写入后的历史快照。 */
  readonly history: AiRuntimeHistorySnapshot
}

/** 测试或宿主应用可注入的 runtime 依赖。 */
export interface AiRuntimeOptions {
  /** 为业务 scope 创建候选 runtime instance ID。 */
  createInstanceId?: (businessId: string, businessInstanceId: string) => string
  /** 为持久化 runtime 记录创建 ID。 */
  createRecordId?: (kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure') => string
  /** 持久化时间戳使用的时钟。 */
  now?: () => number
}

/** 应用层和业务层消费的公共 AI runtime API。 */
export interface AiRuntimeApi {
  /**
   * 注册一个业务，并校验 action 唯一性。
   *
   * @throws 当业务 ID、模块 ID 或函数 action 冲突时抛出。
   */
  registerBusiness(registration: AiBusinessRegistration): void
  /** 按 ID 返回已注册业务定义。 */
  getBusinessRegistration(businessId: string): AiBusinessRegistration | undefined
  /** 按注册顺序列出业务定义。 */
  listBusinessRegistrations(): readonly AiBusinessRegistration[]
  /**
   * 为业务 scope 启动或恢复 runtime instance。
   *
   * `{ businessId, businessInstanceId }` 唯一：重复调用会刷新函数暴露后返回
   * 现有非终态实例。
   */
  startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult>
  /** 通过 runtime 生成 ID 暂停或终止实例。 */
  stopInstance(options: AiRuntimeStopInstanceOptions): Promise<AiRuntimeStopInstanceResult>
  /** 通过业务 scope 暂停或终止实例。 */
  stopInstanceByBusinessScope(options: AiRuntimeStopBusinessInstanceOptions): Promise<AiRuntimeStopInstanceResult>
  /** 向 Ready 实例追加消息并返回更新后的历史。 */
  appendMessages(options: AiRuntimeAppendMessagesOptions): AiRuntimeHistorySnapshot
  /** 返回某个 runtime instance 的函数暴露副本。 */
  getAvailableFunctions(instanceId: string): readonly AiRuntimeFunctionExposure[]
  /** 校验、执行、记录并返回一次函数调用结果。 */
  executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeExecuteFunctionCallResult>
  /** 列出当前内存中追踪的所有 runtime instance。 */
  listInstances(): readonly AiRuntimeInstanceSnapshot[]
  /** 返回完整实例详情；未知 instanceId 返回 `null`。 */
  getInstanceDetail(instanceId: string): AiRuntimeInstanceDetail | null
  /** 返回实例历史；未知 instanceId 返回 `null`。 */
  getInstanceHistory(instanceId: string): AiRuntimeHistorySnapshot | null
  /** 通过业务 scope 查询实例快照。 */
  getInstanceByBusinessScope(scope: AiRuntimeBusinessInstanceScope): AiRuntimeInstanceSnapshot | null
  /** 通过业务 scope 查询实例历史。 */
  getInstanceHistoryByBusinessScope(scope: AiRuntimeBusinessInstanceScope): AiRuntimeHistorySnapshot | null
  /** 订阅 runtime 事件，并返回取消订阅函数。 */
  subscribe(listener: AiRuntimeEventListener): () => void
}
