/**
 * 诊断工具函数。
 *
 * 职责：格式化诊断事件 payload，解析 action 的 moduleId，
 * 通过 onSseEvent 回调上报 llm-request / llm-append 等诊断事件。
 *
 * 使用场景：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. actionModuleId(action)                                     │
 * │    → 从 action 字符串中解析出 moduleId 字段                    │
 * │    → 用于确定 SSE 事件的 eventModuleId                         │
 * │    → 解析失败时返回默认值 'tool'                                │
 * │                                                               │
 * │ 2. stringifyAiHostPayload(data)                               │
 * │    → 将任意 payload 序列化为字符串                             │
 * │    → 用于 SSE 事件的 data 字段（SSE 要求 data 为字符串）        │
 * │                                                               │
 * │ 3. emitLlmDiagnosticEvent(request, scope, turn, type, data)   │
 * │    → 构建 LLM 诊断事件并通过 onSseEvent 回调上报               │
 * │    → type: 'llm-request'（请求 LLM 前）/ 'llm-append'（工具循环结束后追加消息）│
 * │    → 包含 streamKey、scope、type 和序列化后的 data             │
 * └──────────────────────────────────────────────────────────────┘
 */

import { AiInvocationProtocol } from '../internal/invocation-helpers'
import { createAiHostStreamKey } from './scope'
import type { AiHostBusinessScope, AiHostChatRequest, AiHostTurnMeta } from './types'

// ═══════════════════════════════════════════════════════
// Action 解析
// ═══════════════════════════════════════════════════════

/**
 * 从 action 字符串中解析 moduleId。
 * action 格式：rootInstance/childInstance@moduleId@actionName
 * 解析失败时返回默认值 'tool'。
 *
 * 用途：在工具循环中确定 SSE 事件的 eventModuleId，
 * 用于前端按模块过滤和展示诊断事件。
 */
export function actionModuleId(action: string): string {
  return AiInvocationProtocol.tryParseActionPath(action)?.moduleId ?? 'tool'
}

// ═══════════════════════════════════════════════════════
// Payload 序列化
// ═══════════════════════════════════════════════════════

/**
 * 将任意 payload 序列化为字符串。
 * 内部使用 AiInvocationProtocol.stringifyFunctionResult()，
 * 支持 bigint、循环引用等特殊情况的处理。
 *
 * 用途：SSE 事件的 data 字段必须是字符串，
 * 此函数将复杂对象安全地转换为可传输的字符串格式。
 */
export function stringifyAiHostPayload(data: unknown): string {
  return AiInvocationProtocol.stringifyFunctionResult(data)
}

// ═══════════════════════════════════════════════════════
// 诊断事件上报
// ═══════════════════════════════════════════════════════

/**
 * 上报 LLM 诊断事件。
 *
 * 事件类型说明：
 * - 'llm-request': 在请求 LLM 前上报，包含当前轮的工具列表、消息和 systemPrompt
 * - 'llm-append': 在工具循环结束后上报，包含所有追加的消息列表
 *
 * 这些事件通过 AiHostChatRequest.onSseEvent 回调发送，
 * 前端可以监听并用于调试面板、日志记录或性能分析。
 */
export function emitLlmDiagnosticEvent(
  request: AiHostChatRequest,
  scope: AiHostBusinessScope,
  turn: AiHostTurnMeta,
  type: 'llm-request' | 'llm-append',
  data: unknown,
): void {
  request.onSseEvent?.({
    type,
    data: stringifyAiHostPayload(data),
    streamKey: createAiHostStreamKey(scope, 'llm', turn.turnId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: turn.turnId,
    },
  })
}
