import { AiInvocationProtocol } from '@spark-view/spark-ai'
import type { AiChatSendRequest } from '@spark-view/spark-component'
import { createAppAiStreamKey } from './scope'
import type {
  AppAiBusinessScope,
  AppAiTurnMeta,
} from './types'

export function actionModuleId(action: string): string {
  return AiInvocationProtocol.tryParseActionPath(action)?.moduleId ?? 'tool'
}

export function stringifyAiHostPayload(data: unknown): string {
  return AiInvocationProtocol.stringifyFunctionResult(data)
}

export function emitLlmDiagnosticEvent(
  request: AiChatSendRequest,
  scope: AppAiBusinessScope,
  turn: AppAiTurnMeta,
  type: 'llm-request' | 'llm-append',
  data: unknown,
): void {
  request.onSseEvent?.({
    sessionId: scope.instanceId,
    type,
    data: stringifyAiHostPayload(data),
    streamKey: createAppAiStreamKey(scope, 'llm', turn.turnId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: turn.turnId,
    },
  })
}
