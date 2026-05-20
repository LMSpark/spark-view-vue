/**
 * 诊断工具函数。
 *
 * 职责：格式化诊断事件 payload，解析 action 的 moduleId，
 * 通过 onSseEvent 回调上报 llm-request / llm-append 等诊断事件。
 */

import { AiInvocationProtocol } from '../internal/invocation-helpers'
import { createAiHostStreamKey } from './scope'
import type { AiHostBusinessScope, AiHostChatRequest, AiHostTurnMeta } from './types'

/** 从 action 字符串解析 moduleId，解析失败则返回 'tool' */
export function actionModuleId(action: string): string {
  return AiInvocationProtocol.tryParseActionPath(action)?.moduleId ?? 'tool'
}

/** 将任意 payload 序列化为字符串（用于 SSE 事件 data 字段） */
export function stringifyAiHostPayload(data: unknown): string {
  return AiInvocationProtocol.stringifyFunctionResult(data)
}

/**
 * 上报 LLM 诊断事件。
 * 类型：llm-request（请求 LLM 前） / llm-append（工具循环结束后追加消息）
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
