/**
 * Business scope value construction.
 */

import {
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
} from './business-types'
import type { AiHostChatRequest } from '../chat/chat-types'

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiHostBusinessTarget] ${fieldName} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`[AiHostBusinessTarget] ${fieldName} must not be empty.`)
  }
  return trimmed
}

export function normalizeAiHostBusinessTarget(target: AiHostBusinessTarget): AiHostBusinessTarget {
  return new AiHostBusinessTarget(
    normalizeRequiredText(target.businessRegistrationId, 'businessRegistrationId'),
    normalizeRequiredText(target.businessInstanceId, 'businessInstanceId'),
  )
}

export function createAiHostBusinessSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return `${businessRegistrationId}:${businessInstanceId}`
}

export function createAiHostBusinessScope(businessRegistrationId: string, businessInstanceId: string): AiHostBusinessScope {
  const target = normalizeAiHostBusinessTarget(new AiHostBusinessTarget(businessRegistrationId, businessInstanceId))
  const instanceId = createAiHostBusinessSessionId(target.businessRegistrationId, target.businessInstanceId)
  return new AiHostBusinessScope(
    target.businessRegistrationId,
    target.businessInstanceId,
    instanceId,
    instanceId,
  )
}

export function createAiHostBusinessStorageKey(scope: AiHostBusinessScope | AiHostBusinessTarget): string {
  const target = normalizeAiHostBusinessTarget(scope)
  return `spark-ai:${target.businessRegistrationId}:${target.businessInstanceId}`
}

export function createAiHostStreamKey(scope: AiHostBusinessScope, eventModuleId: string, turnId: string): string {
  return [
    scope.businessRegistrationId,
    scope.businessInstanceId,
    eventModuleId,
    turnId,
  ].map(encodeURIComponent).join('::')
}

export function toAiHostRuntimeScope(scope: AiHostBusinessScope): AiHostBusinessRuntimeContext {
  return new AiHostBusinessRuntimeContext(
    scope.businessRegistrationId,
    scope.businessInstanceId,
    scope.instanceId,
  )
}

export function latestUserInput(request: AiHostChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}
