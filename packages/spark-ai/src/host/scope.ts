/**
 * 业务作用域工具函数。
 */

import type { AiHostBusinessScope, AiHostBusinessRuntimeContext, AiHostBusinessTarget } from './types'

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
  return {
    businessRegistrationId: normalizeRequiredText(target.businessRegistrationId, 'businessRegistrationId'),
    businessInstanceId: normalizeRequiredText(target.businessInstanceId, 'businessInstanceId'),
  }
}

export function createAiHostBusinessSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return `${businessRegistrationId}:${businessInstanceId}`
}

export function createAiHostBusinessScope(businessRegistrationId: string, businessInstanceId: string): AiHostBusinessScope {
  const target = normalizeAiHostBusinessTarget({ businessRegistrationId, businessInstanceId })
  const instanceId = createAiHostBusinessSessionId(target.businessRegistrationId, target.businessInstanceId)
  return {
    businessRegistrationId: target.businessRegistrationId,
    businessInstanceId: target.businessInstanceId,
    instanceId,
    runtimeInstanceId: instanceId,
  }
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
  return {
    moduleId: scope.businessRegistrationId,
    moduleInstanceId: scope.businessInstanceId,
    instanceId: scope.instanceId,
  }
}
