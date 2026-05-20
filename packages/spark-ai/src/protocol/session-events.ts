/**
 * 会话事件协议（UI 侧）。
 *
 * 定义 AI 会话记录、历史条目、消息追加、函数调用记录/完成等 UI 交互事件类型。
 *
 * 类型分组（按会话生命周期/事件类型）：
 * ┌──────────────────────────────────────────────────────────┐
 * │ 1. 枚举类型         Status / Role / Source / HistoryStatus│
 * │ 2. 生命周期快照     AiRuntimeSessionLifecycleSnapshot     │
 * │ 3. 历史条目         HistoryEntryBase / Message / Function │
 * │ 4. 会话记录         AiRuntimeSessionRecord                │
 * │ 5. 消息操作         AppendMessage / AppendFunctionCall    │
 * │                    RecordRequest / CompleteFunctionCall   │
 * │ 6. 会话启停         StartSession / StopSession            │
 * └──────────────────────────────────────────────────────────┘
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

/** 会话状态：Started（运行中）| Stopped（已停止） */
export type AiRuntimeSessionStatus = 'Started' | 'Stopped'

/** 消息角色：system / user / assistant */
export type AiRuntimeMessageRole = 'system' | 'user' | 'assistant'

/** 消息来源：ui（用户输入）| llm（模型生成）| system（系统生成） */
export type AiRuntimeMessageSource = 'ui' | 'llm' | 'system'

/** 函数调用状态：requested（已请求）| completed（已完成）| failed（已失败） */
export type AiRuntimeFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

// ═══════════════════════════════════════════════════════
// 2. 生命周期快照
// ═══════════════════════════════════════════════════════

export interface AiRuntimeSessionLifecycleSnapshot extends AiRuntimeInstanceScope {
  readonly status: AiRuntimeSessionStatus
    readonly updatedAt?: number | undefined
    readonly reason?: string | undefined
}

// ═══════════════════════════════════════════════════════
// 3. 历史条目
// ═══════════════════════════════════════════════════════

export interface AiRuntimeHistoryEntryBase extends AiRuntimeInstanceScope {
  readonly id: string
    readonly seq: number
    readonly timestamp: number
    readonly kind: 'message' | 'functionCall'
}

export interface AiRuntimeMessageHistoryEntry extends AiRuntimeHistoryEntryBase {
  readonly kind: 'message'
    readonly role: AiRuntimeMessageRole
    readonly source: AiRuntimeMessageSource
    readonly content: string
    readonly metadata?: Record<string, unknown> | undefined
}

export interface AiRuntimeFunctionCallHistoryEntry extends AiRuntimeHistoryEntryBase {
  readonly kind: 'functionCall'
    readonly action: string // LLM 工具 action 字符串
    readonly args: unknown
    readonly status: AiRuntimeFunctionCallHistoryStatus
    readonly completedAt?: number | undefined
    readonly result?: unknown
    readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
    readonly error?: AiRuntimeFunctionCallFailure | undefined
    readonly modulePath?: string | undefined // 模块路径
    readonly functionId?: string | undefined // 函数标识符
    readonly activePath?: AiRuntimeActivePathSnapshot | undefined
    readonly metadata?: Record<string, unknown> | undefined
}

export type AiRuntimeHistoryEntry = AiRuntimeMessageHistoryEntry | AiRuntimeFunctionCallHistoryEntry

// ═══════════════════════════════════════════════════════
// 4. 会话记录
// ═══════════════════════════════════════════════════════

export interface AiRuntimeSessionRecord extends AiRuntimeInstanceScope {
  readonly moduleId: string
    readonly moduleInstanceId: string
    readonly status: AiRuntimeSessionStatus
    readonly startedAt: number
    readonly updatedAt: number
    readonly stoppedAt?: number | undefined
    readonly reason?: string | undefined
    readonly latestProjection?: AiRuntimeKnowledgeProjection | undefined
    readonly history: readonly AiRuntimeHistoryEntry[]
}

// ═══════════════════════════════════════════════════════
// 5. 消息操作
// ═══════════════════════════════════════════════════════

export interface AiRuntimeAppendMessageOptions extends AiRuntimeInstanceScope {
  readonly role: AiRuntimeMessageRole
    readonly content: string
    readonly source?: AiRuntimeMessageSource | undefined
    readonly metadata?: Record<string, unknown> | undefined
}

// ── 追加函数调用 ──

export interface AiRuntimeAppendFunctionCallOptions extends AiRuntimeInstanceScope {
  readonly action: string // LLM 工具 action 字符串
    readonly args: unknown
    readonly status?: AiRuntimeFunctionCallHistoryStatus | undefined
    readonly result?: unknown
    readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
    readonly error?: AiRuntimeFunctionCallFailure | undefined
    readonly modulePath?: string | undefined // 模块路径
    readonly functionId?: string | undefined // 函数标识符
    readonly activePath?: AiRuntimeActivePathSnapshot | undefined
    readonly metadata?: Record<string, unknown> | undefined
}

// ── 记录函数调用请求 ──

export interface AiRuntimeRecordFunctionCallRequestOptions extends AiRuntimeInstanceScope {
  readonly action: string // LLM 工具 action 字符串
    readonly args: unknown
    readonly modulePath?: string | undefined // 模块路径
    readonly functionId?: string | undefined // 函数标识符
    readonly activePath?: AiRuntimeActivePathSnapshot | undefined
    readonly metadata?: Record<string, unknown> | undefined
}

// ── 完成函数调用 ──

export interface AiRuntimeCompleteFunctionCallOptions extends AiRuntimeInstanceScope {
  readonly historyEntryId: string
    readonly status?: Extract<AiRuntimeFunctionCallHistoryStatus, 'completed' | 'failed'> | undefined
    readonly result?: unknown
    readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
    readonly error?: AiRuntimeFunctionCallFailure | undefined
    readonly metadata?: Record<string, unknown> | undefined
}

// ═══════════════════════════════════════════════════════
// 6. 会话启停
// ═══════════════════════════════════════════════════════

export interface AiRuntimeStartSessionOptions {
  readonly moduleId: string // 模块标识符
  readonly moduleInstanceId: string // 模块实例标识符
  readonly instanceId?: string | undefined
  readonly runtimeInstanceId?: string | undefined
  readonly reason?: string | undefined
}

export interface AiRuntimeStartSessionResult extends AiRuntimeKnowledgeProjection {
  readonly status: 'Started'
    readonly instanceId: string
    readonly moduleId: string // 模块标识符
    readonly moduleInstanceId: string // 模块实例标识符
    readonly lifecycle: AiRuntimeSessionLifecycleSnapshot
    readonly session: AiRuntimeSessionRecord
}

export interface AiRuntimeStopSessionOptions {
  readonly moduleId: string // 模块标识符
  readonly moduleInstanceId: string // 模块实例标识符
  readonly instanceId?: string | undefined
  readonly reason?: string | undefined
}

export interface AiRuntimeStopSessionResult {
  readonly status: 'Stopped'
  readonly instanceId: string
  readonly moduleId: string // 模块标识符
  readonly moduleInstanceId: string // 模块实例标识符
  readonly lifecycle: AiRuntimeSessionLifecycleSnapshot
  readonly session: AiRuntimeSessionRecord
}
