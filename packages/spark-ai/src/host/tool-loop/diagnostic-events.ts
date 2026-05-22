import { createAiHostStreamKey } from '../business/business-scope'
import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostChatRequest, AiHostSseEvent, AiHostTurnMeta } from '../chat/chat-types'
import { stringifyAiHostPayload } from './payload-codec'

export function emitLlmDiagnosticEvent(
  request: AiHostChatRequest,
  scope: AiHostBusinessScope,
  turn: AiHostTurnMeta,
  type: 'llm-request' | 'llm-append',
  data: unknown,
): void {
  request.onSseEvent?.(createScopedSseEvent(scope, turn.turnId, 'llm', type, stringifyAiHostPayload(data)))
}

export function emitToolResultEvent(
  request: AiHostChatRequest,
  scope: AiHostBusinessScope,
  turn: AiHostTurnMeta,
  eventModuleId: string,
  data: unknown,
): void {
  request.onSseEvent?.(createScopedSseEvent(
    scope,
    turn.turnId,
    eventModuleId,
    'tool-result',
    stringifyAiHostPayload(data),
  ))
}

export function eventModuleIdFromProtocolCall(
  toolName: string,
  args: Readonly<Record<string, unknown>>,
): string {
  if (toolName === 'describeKind' && typeof args['kind'] === 'string' && args['kind'].trim().length > 0) {
    return args['kind']
  }
  const path = typeof args['path'] === 'string' ? args['path'] : ''
  return kindFromPathTail(path) ?? toolName
}

function createScopedSseEvent(
  scope: AiHostBusinessScope,
  turnId: string,
  eventModuleId: string,
  type: AiHostSseEvent['type'],
  data: string,
): AiHostSseEvent {
  return {
    type,
    data,
    streamKey: createAiHostStreamKey(scope, eventModuleId, turnId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId,
      turnId,
    },
  }
}

function kindFromPathTail(path: string): string | null {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') return null
  const tail = trimmed.split('/').filter(Boolean).at(-1)
  if (tail === undefined) return null
  const bracketIndex = tail.indexOf('[')
  const kind = bracketIndex < 0 ? tail : tail.slice(0, bracketIndex)
  return kind.trim().length > 0 ? kind : null
}
