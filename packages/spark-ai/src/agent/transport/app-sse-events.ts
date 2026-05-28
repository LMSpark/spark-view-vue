/**
 * ═══════════════════════════════════════════════════════════════
 * agent/transport/app-sse-events.ts — APP 层 SSE 事件类型定义
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 传输层的 SSE 事件契约。定义 APP 层推送事件的基础类型
 *   和事件名枚举。本文件不依赖任何框架，是 spark-ai 与 APP 层的双向契约。
 *
 * 【核心类型】
 *   AiAgentAppSseEventName  — SSE 事件名联合类型（业务事件 + llm-frame + 通配后缀）
 *   AiAgentAppSseEvent<T>   — SSE 事件结构（name / ok / data / raw 字段）
 *
 * 【事件分类】
 *   业务事件：page-config / data-batch-job / data-change / notification
 *   调试事件：debug-route-request / debug-route-result / debug-screenshot-* / debug-fc-error-report
 *   AI 事件：llm-frame（核心：承载 AI turn 的 delta/reasoning/result/error/done 事件）
 *
 * 【消费方】turn-event-collector（监听 llm-frame）、APP 层 SSE 实现
 * ═══════════════════════════════════════════════════════════════
 */

import type { ApiEnvelopeContext, ApiEnvelopeEvent } from '@spark-view/spark-utils'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · SSE 事件名 — 所有合法的 APP SSE 事件名
// ═══════════════════════════════════════════════════════════════

/**
 * SSE 事件名联合类型。
 *
 * 预定义的事件名：
 *   page-config              — 页面配置变更
 *   data-batch-job           — 批量数据任务状态
 *   data-change              — 数据变更通知
 *   notification             — 通用通知
 *   debug-route-request      — 调试路由请求
 *   debug-route-result       — 调试路由结果
 *   debug-screenshot-request — 截图请求
 *   debug-screenshot-result  — 截图结果
 *   debug-fc-error-report    — 函数调用错误报告
 *   llm-frame                — AI 推理帧事件（核心：delta/reasoning/result/error/done）
 *
 * `string & {}` 后缀允许业务方扩展自定义事件名，同时保留 IDE 自动补全。
 */
export type AiAgentAppSseEventName =
  | 'page-config'
  | 'data-batch-job'
  | 'data-change'
  | 'notification'
  | 'debug-route-request'
  | 'debug-route-result'
  | 'debug-screenshot-request'
  | 'debug-screenshot-result'
  | 'debug-fc-error-report'
  | 'llm-frame'
  | (string & {})

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · SSE 事件结构
// ═══════════════════════════════════════════════════════════════

/**
 * APP SSE 事件结构。
 *
 * 字段说明：
 *   name            — 事件名（如 llm-frame）
 *   ok              — 事件是否成功（false 表示 error 事件）
 *   data            — 已解析的事件数据（泛型 T）
 *   rawData         — 原始 JSON 字符串
 *   rawPayload      — 原始解析荷载（未做类型转换）
 *   protocolVersion — 可选协议版本号
 *   context         — API 信封上下文（可选）
 *   event           — API 信封事件（可选）
 */
export type AiAgentAppSseEvent<T = unknown> = Readonly<{
  name: AiAgentAppSseEventName
  ok: boolean
  data: T
  rawData: string
  rawPayload: unknown
  protocolVersion?: number
  context?: ApiEnvelopeContext
  event?: ApiEnvelopeEvent
}>
