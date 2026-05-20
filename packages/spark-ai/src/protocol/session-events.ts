/**
 * 会话事件协议（UI 侧）。
 *
 * 定义 AI 会话记录、历史条目、消息追加、函数调用记录/完成等 UI 交互事件类型。
 *
 * 事件时序：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 启动会话                                                   │
 * │    AiRuntimeStartSessionOptions → startSession()              │
 * │    → 返回 AiRuntimeStartSessionResult（含投影、会话记录）      │
 * │                                                               │
 * │ 2. 追加消息/函数调用                                           │
 * │    AiRuntimeAppendMessageOptions → appendMessage()            │
 * │      → 返回 AiRuntimeMessageHistoryEntry                      │
 * │    AiRuntimeRecordFunctionCallRequestOptions                  │
 * │      → recordFunctionCallRequest()                            │
 * │      → 返回 AiRuntimeFunctionCallHistoryEntry (requested)     │
 * │                                                               │
 * │ 3. 完成函数调用                                               │
 * │    AiRuntimeCompleteFunctionCallOptions → completeFunctionCall()│
 * │      → 返回 AiRuntimeFunctionCallHistoryEntry (completed/failed)│
 * │                                                               │
 * │ 4. 停止会话                                                   │
 * │    AiRuntimeStopSessionOptions → stopSession()                │
 * │    → 返回 AiRuntimeStopSessionResult                           │
 * │                                                               │
 * │ 5. 会话记录查询                                               │
 * │    AiRuntimeSessionRecord（深拷贝快照，包含完整历史）          │
 * │    AiRuntimeSessionLifecycleSnapshot（轻量生命周期状态）       │
 * └──────────────────────────────────────────────────────────────┘
 *
 * ID 格式：
 * - historyEntryId: "{instanceId}:history:{seq}"
 * - streamKey (host): "reg::instance::module::turnId"
 */

import type {
  AiRuntimeInstanceScope,
  AiRuntimeActivePathSnapshot,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionResultMessage,
  AiRuntimeKnowledgeProjection,
} from './runtime-protocol'

// ═══════════════════════════════════════════════════════
// 1. 枚举类型
// ═══════════════════════════════════════════════════════

/** 会话状态 */
export type AiRuntimeSessionStatus =
  | 'Started'  // 会话运行中，可接受消息和函数调用
  | 'Stopped'  // 会话已停止，不再接受操作

/** 消息角色：标识消息属于哪个参与者 */
export type AiRuntimeMessageRole =
  | 'system'    // 系统提示，通常由开发者设置
  | 'user'      // 用户输入
  | 'assistant' // AI 助手回复

/** 消息来源：标识消息由谁生成 */
export type AiRuntimeMessageSource =
  | 'ui'     // 用户界面输入（对应 user 角色）
  | 'llm'    // LLM 模型生成（对应 assistant 角色）
  | 'system' // 系统生成（对应 system 角色）

/** 函数调用历史状态 */
export type AiRuntimeFunctionCallHistoryStatus =
  | 'requested'  // 已发起请求，等待执行结果
  | 'completed'  // 执行成功完成
  | 'failed'     // 执行失败，携带错误信息

// ═══════════════════════════════════════════════════════
// 2. 生命周期快照（轻量状态，用于返回结果中）
// ═══════════════════════════════════════════════════════

/**
 * 会话生命周期快照。
 * 用于 startSession/stopSession 的返回结果中，
 * 告知调用方当前会话的状态和最近一次变更时间。
 */
export interface AiRuntimeSessionLifecycleSnapshot extends AiRuntimeInstanceScope {
  /** 当前会话状态 */
  readonly status: AiRuntimeSessionStatus
  /** 最近一次状态变更的时间戳（毫秒） */
  readonly updatedAt?: number | undefined
  /** 变更原因（如用户主动停止、系统超时等） */
  readonly reason?: string | undefined
}

// ═══════════════════════════════════════════════════════
// 3. 历史条目（消息和函数调用）
// ═══════════════════════════════════════════════════════

/** 历史条目基础类型：所有历史记录共有的字段 */
export interface AiRuntimeHistoryEntryBase extends AiRuntimeInstanceScope {
  /** 唯一标识符，格式为 "{instanceId}:history:{seq}" */
  readonly id: string
  /** 序列号，单调递增，用于排序 */
  readonly seq: number
  /** 创建时间戳（毫秒） */
  readonly timestamp: number
  /** 条目类型：消息或函数调用 */
  readonly kind: 'message' | 'functionCall'
}

/** 消息历史条目：用户/助手/系统消息的记录 */
export interface AiRuntimeMessageHistoryEntry extends AiRuntimeHistoryEntryBase {
  readonly kind: 'message'
  /** 消息角色 */
  readonly role: AiRuntimeMessageRole
  /** 消息来源 */
  readonly source: AiRuntimeMessageSource
  /** 消息内容文本 */
  readonly content: string
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

/**
 * 函数调用历史条目：记录一次 LLM 发起的函数调用。
 *
 * 生命周期：
 * 1. requested → recordFunctionCallRequest() 创建
 * 2. completed/failed → completeFunctionCall() 更新
 *
 * 也可以直接创建为 completed/failed（通过 appendFunctionCall）。
 */
export interface AiRuntimeFunctionCallHistoryEntry extends AiRuntimeHistoryEntryBase {
  readonly kind: 'functionCall'
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** LLM 传入的参数（原始值） */
  readonly args: unknown
  /** 当前状态 */
  readonly status: AiRuntimeFunctionCallHistoryStatus
  /** 完成时间戳（仅当状态为 completed 或 failed 时设置） */
  readonly completedAt?: number | undefined
  /** 执行结果（成功时设置） */
  readonly result?: unknown
  /** 序列化的结果消息（用于展示给 LLM） */
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  /** 错误信息（失败时设置） */
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  /** 模块路径（可选，用于追溯） */
  readonly modulePath?: string | undefined
  /** 函数标识符（可选） */
  readonly functionId?: string | undefined
  /** 活跃模块实例路径快照（可选） */
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 历史条目联合类型 */
export type AiRuntimeHistoryEntry = AiRuntimeMessageHistoryEntry | AiRuntimeFunctionCallHistoryEntry

// ═══════════════════════════════════════════════════════
// 4. 会话记录（完整的会话快照）
// ═══════════════════════════════════════════════════════

/**
 * 会话记录：内存中一个 AI 会话的完整快照。
 * 包含状态、时间戳、知识投影和完整的历史记录列表。
 *
 * 注意：对外返回的会话记录都是深拷贝，防止外部修改内部状态。
 */
export interface AiRuntimeSessionRecord extends AiRuntimeInstanceScope {
  readonly moduleId: string
  readonly moduleInstanceId: string
  /** 当前会话状态 */
  readonly status: AiRuntimeSessionStatus
  /** 会话启动时间戳 */
  readonly startedAt: number
  /** 最近一次更新时间戳 */
  readonly updatedAt: number
  /** 会话停止时间戳（仅 Stopped 状态时设置） */
  readonly stoppedAt?: number | undefined
  /** 停止/变更原因（可选） */
  readonly reason?: string | undefined
  /** 最后一次知识投影快照（可选） */
  readonly latestProjection?: AiRuntimeKnowledgeProjection | undefined
  /** 历史记录列表，按 seq 升序排列 */
  readonly history: readonly AiRuntimeHistoryEntry[]
}

// ═══════════════════════════════════════════════════════
// 5. 消息操作选项
// ═══════════════════════════════════════════════════════

/** 追加消息的选项 */
export interface AiRuntimeAppendMessageOptions extends AiRuntimeInstanceScope {
  /** 消息角色 */
  readonly role: AiRuntimeMessageRole
  /** 消息内容 */
  readonly content: string
  /** 消息来源（不传则根据 role 自动推断） */
  readonly source?: AiRuntimeMessageSource | undefined
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 追加函数调用的选项 */
export interface AiRuntimeAppendFunctionCallOptions extends AiRuntimeInstanceScope {
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** 参数（原始值） */
  readonly args: unknown
  /** 状态（默认 'completed'） */
  readonly status?: AiRuntimeFunctionCallHistoryStatus | undefined
  /** 执行结果（可选） */
  readonly result?: unknown
  /** 结果消息（可选） */
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  /** 错误信息（可选） */
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  /** 模块路径（可选） */
  readonly modulePath?: string | undefined
  /** 函数标识符（可选） */
  readonly functionId?: string | undefined
  /** 活跃模块实例路径快照（可选） */
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 记录函数调用请求的选项（status 固定为 'requested'） */
export interface AiRuntimeRecordFunctionCallRequestOptions extends AiRuntimeInstanceScope {
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** 参数（原始值） */
  readonly args: unknown
  /** 模块路径（可选） */
  readonly modulePath?: string | undefined
  /** 函数标识符（可选） */
  readonly functionId?: string | undefined
  /** 活跃模块实例路径快照（可选） */
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 完成函数调用的选项 */
export interface AiRuntimeCompleteFunctionCallOptions extends AiRuntimeInstanceScope {
  /** 要更新的历史条目 ID */
  readonly historyEntryId: string
  /** 状态（默认根据 error 是否存在推断） */
  readonly status?: Extract<AiRuntimeFunctionCallHistoryStatus, 'completed' | 'failed'> | undefined
  /** 执行结果（可选） */
  readonly result?: unknown
  /** 结果消息（可选） */
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  /** 错误信息（可选，设置后 status 默认为 'failed'） */
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

// ═══════════════════════════════════════════════════════
// 6. 会话启停选项和结果
// ═══════════════════════════════════════════════════════

/** 启动会话的选项 */
export interface AiRuntimeStartSessionOptions {
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块实例标识符 */
  readonly moduleInstanceId: string
  /** 会话实例 ID（不传则默认 moduleInstanceId 或继承已有会话） */
  readonly instanceId?: string | undefined
  /** AI 运行时实例 ID（不传则默认等于 instanceId） */
  readonly runtimeInstanceId?: string | undefined
  /** 启动原因（可选） */
  readonly reason?: string | undefined
}

/**
 * 启动会话的结果。
 * 继承知识投影，附加会话状态和生命周期快照。
 */
export interface AiRuntimeStartSessionResult extends AiRuntimeKnowledgeProjection {
  /** 固定为 'Started' */
  readonly status: 'Started'
  /** 会话实例 ID */
  readonly instanceId: string
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块实例标识符 */
  readonly moduleInstanceId: string
  /** 生命周期快照 */
  readonly lifecycle: AiRuntimeSessionLifecycleSnapshot
  /** 完整会话记录（深拷贝） */
  readonly session: AiRuntimeSessionRecord
}

/** 停止会话的选项 */
export interface AiRuntimeStopSessionOptions {
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块实例标识符 */
  readonly moduleInstanceId: string
  /** 会话实例 ID（不传则继承已有会话） */
  readonly instanceId?: string | undefined
  /** 停止原因（可选） */
  readonly reason?: string | undefined
}

/** 停止会话的结果 */
export interface AiRuntimeStopSessionResult {
  /** 固定为 'Stopped' */
  readonly status: 'Stopped'
  /** 会话实例 ID */
  readonly instanceId: string
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块实例标识符 */
  readonly moduleInstanceId: string
  /** 生命周期快照 */
  readonly lifecycle: AiRuntimeSessionLifecycleSnapshot
  /** 完整会话记录（深拷贝） */
  readonly session: AiRuntimeSessionRecord
}
