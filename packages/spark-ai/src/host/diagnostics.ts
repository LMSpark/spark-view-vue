/**
 * 诊断工具函数。
 */

import { AiInvocationProtocol } from '../internal/invocation-helpers'
import { createAiHostStreamKey } from './scope'
import type { AiHostBusinessScope, AiHostChatRequest, AiHostTurnMeta } from './types'

export function actionModuleId(action: string): string {
  return AiInvocationProtocol.tryParseActionPath(action)?.moduleId ?? 'tool'
}

export function stringifyAiHostPayload(data: unknown): string {
  return AiInvocationProtocol.stringifyFunctionResult(data)
}

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
