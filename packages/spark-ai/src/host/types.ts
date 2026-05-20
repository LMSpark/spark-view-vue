/**
 * AI Host 跨框架协议类型。
 *
 * 定义业务运行时、作用域、传输层和选项的接口契约，
 * 不依赖任何前端框架（Vue/React/Angular）。
 * 具体框架的实现只需满足这些接口的结构类型。
 *
 * 类型分组（按消息流转时序）：
 * ┌─────────────────────────────────────────────┐
 * │ 1. 聊天请求         AiHostChatRequest        │
 * │ 2. SSE 事件         AiHostSseEvent 等        │
 * │ 3. 业务作用域       AiHostBusinessScope 等   │
 * │ 4. 运行时上下文     AiHostBusinessRuntimeContext 等 │
 * │ 5. 运行时方法选项   AiHostBusinessAppendMessageOptions 等 │
 * │ 6. 生命周期指令     AiHostBusinessLifecycleDirective 等 │
 * │ 7. 运行时契约       AiHostBusinessRuntime    │
 * │ 8. Turn 元信息      AiHostTurnMeta            │
 * │ 9. 传输层规范       AiHostTransport* 系列     │
 * │ 10. 传输层契约      AiHostTransport           │
 * │ 11. 宿主选项        AiHostOptions             │
 * │ 12. 发送器/会话     AiHostSender / AiHostBusinessSession │
 * │ 13. 已选业务        AiHostSelectedBusiness    │
 * └─────────────────────────────────────────────┘
 */

import type {
  AiRuntimeKnowledgeProjection,
  AiRuntimeFunctionCallResult,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionResult,
} from '../protocol/runtime-contracts'

// ═══════════════════════════════════════════════════════
// 1. 聊天请求（框架无关的最小请求接口）
//
// 客户端发起一次对话的入口，包含历史消息和各类回调。
// 回调用于在流式响应过程中接收增量数据、SSE 事件和函数调用记录。
// ═══════════════════════════════════════════════════════

export interface AiHostChatRequest {
  /** 历史消息列表，包含 user / assistant / system 三种角色 */
  historyMsgs: Array<{ readonly role: 'user' | 'assistant' | 'system'; readonly content: string }>
  /** Turn 轮次元信息，未提供时由 normalizeTurn() 自动生成 */
  turn?: AiHostTurnMeta
  /** 系统提示词，会覆盖业务运行时 getSystemPrompt() 的结果 */
  systemPrompt?: string
  /** 取消信号，用于中止当前请求 */
  signal?: AbortSignal
  /** 推理内容回调（流式接收 LLM 的 reasoning 文本） */
  onReasoning?: (reasoning: string) => void
  /** 增量文本回调（流式接收 LLM 回复的 delta 片段） */
  onDelta?: (delta: string) => void
  /** Token 使用量回调（接收 LLM 的 token 统计） */
  onUsage?: (usageRaw: Record<string, unknown>) => void
  /** SSE 原始事件回调（接收所有类型的 SSE 事件） */
  onSseEvent?: (event: AiHostSseEvent) => void
  /** 函数调用记录回调（记录每次工具调用的入参、结果和耗时） */
  onFcCall?: (record: AiHostFcCallRecord) => void
}

// ═══════════════════════════════════════════════════════
// 2. SSE 事件与函数调用记录
//
// SSE 事件是流式响应过程中上报的原始事件，
// 函数调用记录是工具循环中每次 function call 的审计日志。
// ═══════════════════════════════════════════════════════

/** SSE 流式事件，包含事件类型、数据和作用域信息 */
export interface AiHostSseEvent {
  /** 事件类型：delta / reasoning / usage / result / error / tool-result / llm-request / llm-append */
  type: string
  /** 事件数据，可能是字符串或序列化后的 JSON */
  data: unknown
  /** SSE 流的唯一标识 key，格式：registrationId::instanceId::eventModuleId::turnId */
  streamKey: string
  /** 事件所属的作用域，包含业务注册 ID、实例 ID、模块 ID 和轮次 ID */
  scope: {
    businessRegistrationId: string
    businessInstanceId: string
    eventModuleId: string
    turnId: string
  }
}

/** 函数调用审计记录，记录每次工具调用的完整信息 */
export interface AiHostFcCallRecord {
  /** 工具名称（action 字符串） */
  toolName: string
  /** 调用参数 */
  args: unknown
  /** 所属轮次 ID */
  turnId: string
  /** 工具循环中的第几轮 */
  round: number
  /** LLM tool_call 的 ID（可选） */
  callId?: string
  /** 执行状态：success 表示返回 ok=true，error 表示返回 ok=false */
  status: 'success' | 'error'
  /** 函数执行结果 */
  result: AiRuntimeFunctionCallResult<unknown>
  /** 执行耗时（毫秒） */
  durationMs: number
}

// ═══════════════════════════════════════════════════════
// 3. 业务作用域
//
// 标识一次业务会话的完整上下文：注册 ID（模块类型）+ 实例 ID（具体实体）。
// ═══════════════════════════════════════════════════════

/** 业务作用域，唯一标识一个业务会话的运行上下文 */
export interface AiHostBusinessScope {
  /** 业务模块的注册 ID（模块类型标识） */
  readonly businessRegistrationId: string
  /** 业务实例 ID（具体实体标识） */
  readonly businessInstanceId: string
  /** 会话实例 ID，由 registrationId:instanceId 拼接而成 */
  readonly instanceId: string
  /** 运行时实例 ID，当前与 instanceId 等价 */
  readonly runtimeInstanceId: string
}

/** 业务目标，用于创建会话时的最小标识 */
export interface AiHostBusinessTarget {
  readonly businessRegistrationId: string
  readonly businessInstanceId: string
}

// ═══════════════════════════════════════════════════════
// 4. 业务运行时上下文 & 方法选项
//
// RuntimeContext 是业务运行时方法的通用上下文参数，
// 各个 Options 接口定义了运行时方法的扩展选项。
// ═══════════════════════════════════════════════════════

/** 业务运行时方法的通用上下文，包含模块 ID 和实例 ID */
export interface AiHostBusinessRuntimeContext {
  /** 模块注册 ID */
  readonly moduleId: string
  /** 模块实例 ID */
  readonly moduleInstanceId: string
  /** 会话实例 ID */
  readonly instanceId: string
}

/** 追加消息到会话的选项 */
export interface AiHostBusinessAppendMessageOptions extends AiHostBusinessRuntimeContext {
  /** 消息角色：system / user / assistant */
  readonly role: 'system' | 'user' | 'assistant'
  /** 消息内容文本 */
  readonly content: string
  /** 消息来源：system（系统生成）/ ui（用户界面输入）/ llm（LLM 回复） */
  readonly source?: 'system' | 'ui' | 'llm' | undefined
  /** 附加元数据，可用于记录生命周期状态等额外信息 */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 执行函数调用的选项 */
export interface AiHostBusinessExecuteFunctionCallOptions extends AiHostBusinessRuntimeContext {
  /** 要执行的 action 字符串，格式为 rootInstance/childInstance@module@actionName */
  readonly action: string
  /** 函数调用参数 */
  readonly args: unknown
  /** 知识投影快照，用于函数翻译时匹配可用函数 */
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

// ═══════════════════════════════════════════════════════
// 5. 生命周期指令
//
// 控制函数调用后业务会话的继续/完成/中止行为。
// ═══════════════════════════════════════════════════════

/** 生命周期状态：continue（继续循环）/ complete（正常结束）/ abort（异常中止） */
export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

/** 生命周期指令，决定工具循环是否继续以及结束时的行为 */
export interface AiHostBusinessLifecycleDirective {
  /** 指令状态 */
  readonly status: AiHostBusinessLifecycleStatus
  /** 指令原因（当 status 不是 continue 时建议填写） */
  readonly reason?: string | undefined
  /** 最终回复消息，会展示给用户并追加到会话历史 */
  readonly finalAssistantMessage?: string | undefined
  /** 是否释放业务实例，为 true 时会调用 releaseModuleInstance() */
  readonly releaseInstance?: boolean | undefined
}

/** 函数调用后的回调选项，包含 action、参数和执行结果 */
export interface AiHostBusinessAfterFunctionCallOptions extends AiHostBusinessRuntimeContext {
  /** 已执行的 action 字符串 */
  readonly action: string
  /** 调用参数 */
  readonly args: unknown
  /** 函数执行结果 */
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

// ═══════════════════════════════════════════════════════
// 6. 业务运行时契约
//
// 每个业务模块必须实现的核心接口，定义会话生命周期、
// 消息管理、函数调用执行和生命周期控制等能力。
// ═══════════════════════════════════════════════════════

/** 业务运行时契约，定义业务模块的核心能力 */
export interface AiHostBusinessRuntime {
  /** 模块注册 ID，用于在 registry 中查找 */
  readonly moduleId: string
  /** 获取系统提示词（可选），根据运行时上下文返回不同的 prompt */
  getSystemPrompt?(context: AiHostBusinessRuntimeContext): string | undefined
  /** 启动会话：创建或复用会话，返回知识投影 */
  startSession(context: AiHostBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult>
  /** 追加消息到会话历史，返回新增的历史条目 */
  appendMessage(options: AiHostBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry
  /** 获取当前会话记录（可选），包含会话状态和生命周期快照 */
  getSession?(context: AiHostBusinessRuntimeContext): AiRuntimeSessionRecord | null
  /** 列出所有会话记录 */
  listSessions(): readonly AiRuntimeSessionRecord[]
  /** 执行函数调用：将 action 字符串翻译后执行，返回结果 */
  executeFunctionCall(options: AiHostBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>>
  /** 函数调用后的生命周期回调（可选），返回 continue / complete / abort 指令 */
  afterFunctionCall?(options: AiHostBusinessAfterFunctionCallOptions): AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  /** 结束业务实例（可选），根据生命周期指令执行清理 */
  endBusinessInstance?(context: AiHostBusinessRuntimeContext, directive: AiHostBusinessLifecycleDirective): void | Promise<void>
  /** 获取会话历史条目列表 */
  getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[]
  /** 释放模块实例（可选），清理实例缓存和资源 */
  releaseModuleInstance?(moduleInstanceId: string): void
}

// ═══════════════════════════════════════════════════════
// 7. Turn 轮次元信息
//
// 标识一次对话轮次的唯一 ID、序号和时间戳，
// 用于 SSE 流 key 生成、消息去重和并发控制。
// ═══════════════════════════════════════════════════════

/** Turn 轮次元信息，标识一次对话轮次的上下文 */
export interface AiHostTurnMeta {
  /** 轮次唯一 ID（UUID） */
  readonly turnId: string
  /** 轮次序号（从 1 开始递增） */
  readonly seq: number
  /** 基础版本号，通常为历史消息数量减 1 */
  readonly baseRevision: number
  /** 请求入队时间（ISO 8601 格式） */
  readonly queuedAt: string
  /** 请求开始时间（ISO 8601 格式） */
  readonly startedAt: string
  /** 最大并行轮次数，当前固定为 1 */
  readonly maxParallelTurns: number
}

// ═══════════════════════════════════════════════════════
// 8. 传输层规范
//
// 定义 LLM 工具规范、传输消息和工具调用的数据结构，
// 与具体传输实现（fetch/SSE/WebSocket）无关。
// ═══════════════════════════════════════════════════════

/** LLM 工具规范，用于告诉 LLM 有哪些可用工具 */
export interface AiHostTransportToolSpec {
  readonly type: 'function'
  readonly function: {
    /** 工具名称，由 AiRuntimeToolCodec 生成，格式为 ai_序号_模块名_函数名 */
    readonly name: string
    /** 工具描述，包含原始描述、使用规则和失败处理 */
    readonly description: string
    /** 工具参数的 JSON Schema */
    readonly parameters: Record<string, unknown>
  }
}

/** 传输层消息，对应 LLM 的 message 结构 */
export interface AiHostTransportMessage {
  /** 消息角色：user / assistant / system / tool */
  readonly role: string
  /** 消息内容文本 */
  readonly content: string
  /** 工具调用结果的关联 ID（tool 角色消息必需） */
  readonly tool_call_id?: string | undefined
  /** 工具调用列表（assistant 角色消息可能包含） */
  readonly tool_calls?: readonly AiHostTransportToolCall[] | undefined
}

/** LLM 返回的工具调用 */
export interface AiHostTransportToolCall {
  /** 工具调用唯一 ID */
  readonly id?: string | undefined
  /** 工具类型，通常为 "function" */
  readonly type?: string | undefined
  /** 工具函数信息 */
  readonly function?: {
    readonly name?: string | undefined
    /** 工具参数的 JSON 字符串（需要进一步解析） */
    readonly arguments?: string | undefined
  } | undefined
}

/** SSE 流式请求的输入参数 */
export interface AiHostStreamTurnInput {
  /** 会话 ID */
  readonly sessionId: string
  /** 业务作用域 */
  readonly scope: AiHostBusinessScope
  /** Turn 轮次元信息 */
  readonly turn: AiHostTurnMeta
  /** 完整的系统提示词 */
  readonly systemPrompt: string
  /** 可用的工具规范列表 */
  readonly tools: readonly AiHostTransportToolSpec[]
  /** 历史消息列表 */
  readonly messages: readonly AiHostTransportMessage[]
  /** 取消信号 */
  readonly signal?: AbortSignal | undefined
  /** SSE 原始事件回调 */
  readonly onSseEvent?: ((event: AiHostSseEvent) => void) | undefined
  /** 增量文本回调 */
  readonly onDelta?: ((delta: string) => void) | undefined
  /** 推理内容回调 */
  readonly onReasoning?: ((reasoning: string) => void) | undefined
  /** Token 使用量回调 */
  readonly onUsage?: ((usage: Record<string, unknown>) => void) | undefined
}

/** SSE 流式请求的最终结果 */
export interface AiHostStreamTurnResult {
  /** LLM 回复的完整文本 */
  readonly text: string
  /** LLM 的推理文本（可能为空） */
  readonly reasoning?: string | undefined
  /** LLM 的工具调用列表 */
  readonly toolCalls: readonly AiHostTransportToolCall[]
}

/** 追加消息到会话的输入参数 */
export interface AiHostAppendMessagesInput {
  readonly sessionId: string
  readonly scope: AiHostBusinessScope
  readonly turn: AiHostTurnMeta
  readonly messages: readonly AiHostTransportMessage[]
}

// ═══════════════════════════════════════════════════════
// 9. 传输层契约
//
// 定义与 LLM 后端通信的最低接口，
// 具体实现可以是 AiHostFetchTransport（fetch + SSE）
// 或其他传输方式。
// ═══════════════════════════════════════════════════════

/** 传输层契约，定义与 LLM 后端通信的核心方法 */
export interface AiHostTransport {
  /** SSE 流式请求：发送消息给 LLM 并接收流式响应 */
  streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult>
  /** 追加消息到会话：不触发 LLM 回复，仅写入历史 */
  appendMessages(input: AiHostAppendMessagesInput): Promise<void>
}

// ═══════════════════════════════════════════════════════
// 10. 宿主选项
//
// 初始化 AI Host 时的配置项，包含业务注册表和传输层实例。
// ═══════════════════════════════════════════════════════

/** AI Host 初始化选项 */
export interface AiHostOptions {
  /** 业务注册表，用于按 moduleId 查找对应的业务运行时 */
  readonly registry: {
    get(moduleId: string): AiHostBusinessRuntime | undefined
    list(): readonly AiHostBusinessRuntime[]
  }
  /** 传输层实例，负责与 LLM 后端通信 */
  readonly transport: AiHostTransport
  /** 工具循环最大轮次数（可选），不设置时无限制 */
  readonly maxToolRounds?: number | undefined
}

// ═══════════════════════════════════════════════════════
// 11. 发送器 & 业务会话
//
// Sender 是单次发送的函数类型，
// BusinessSession 是可复用的持久会话对象。
// ═══════════════════════════════════════════════════════

/** 发送器函数类型：发送一次聊天请求（进入工具调用循环） */
export interface AiHostSender {
  (request: AiHostChatRequest): Promise<void>
}

/** 持久化的 AI 业务会话，管理完整的会话生命周期 */
export interface AiHostBusinessSession {
  /** 业务目标标识 */
  readonly target: AiHostBusinessTarget
  /** 业务作用域 */
  readonly scope: AiHostBusinessScope
  /** 浏览器存储 key，用于持久化会话状态 */
  readonly storageKey: string
  /** 会话 ID，与 scope.instanceId 等价 */
  readonly sessionId: string
  /** 页面 ID，与 target.businessInstanceId 等价 */
  readonly pageId: string
  /** 发送器函数，发送后进入工具调用循环 */
  readonly sender: AiHostSender
  /** 启动会话：查找 runtime 并调用 startSession() */
  start(): Promise<void>
  /** 获取当前会话记录 */
  getSessionRecord(): AiRuntimeSessionRecord | null
  /** 发送聊天请求（同 sender） */
  send(request: AiHostChatRequest): Promise<void>
}

// ═══════════════════════════════════════════════════════
// 12. 已选业务
//
// 在一次消息发送过程中缓存的已解析业务运行时，
// 避免重复查找 registry 和 startSession。
// ═══════════════════════════════════════════════════════

/** 已选中的业务运行时，包含运行时实例、作用域和知识投影 */
export interface AiHostSelectedBusiness {
  /** 已解析的业务运行时 */
  readonly runtime: AiHostBusinessRuntime
  /** 业务作用域 */
  readonly scope: AiHostBusinessScope
  /** 当前会话的知识投影快照 */
  projection: AiRuntimeKnowledgeProjection
}
