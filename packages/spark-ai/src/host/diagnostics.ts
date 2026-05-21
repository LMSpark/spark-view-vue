/**
 * Host 诊断工具。
 *
 * 诊断事件不再解析旧 action path,而是从协议工具参数推导事件归属。
 */

import type { LlmJsonValue } from '../schema'
import { createAiHostStreamKey } from './scope'
import type { AiHostBusinessScope, AiHostChatRequest, AiHostTurnMeta } from './types'

export function eventModuleIdFromProtocolCall(
  toolName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): string {
  if (toolName === 'describeKind' && typeof args['kind'] === 'string' && args['kind'].trim().length > 0) {
    return args['kind']
  }
  const path = typeof args['path'] === 'string' ? args['path'] : ''
  const tailKind = kindFromPathTail(path)
  return tailKind ?? toolName
}

export function actionModuleId(action: string): string {
  return kindFromPathTail(action) ?? 'tool'
}

export function stringifyAiHostPayload(data: unknown): string {
  return safeJsonStringify(data)
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

function kindFromPathTail(path: string): string | null {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') return null
  const tail = trimmed.split('/').filter(Boolean).at(-1)
  if (tail === undefined) return null
  const bracketIndex = tail.indexOf('[')
  const kind = bracketIndex < 0 ? tail : tail.slice(0, bracketIndex)
  return kind.trim().length > 0 ? kind : null
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString()
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
    }
    return item
  })
}
