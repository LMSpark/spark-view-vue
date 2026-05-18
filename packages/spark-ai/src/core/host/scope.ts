/**
 * 业务作用域工具函数。
 */

import type { AiHostBusinessScope, AiHostBusinessRuntimeContext } from './types'

export function createAiHostBusinessSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return `${businessRegistrationId}:${businessInstanceId}`
}

export function createAiHostBusinessScope(businessRegistrationId: string, businessInstanceId: string): AiHostBusinessScope {
  const instanceId = createAiHostBusinessSessionId(businessRegistrationId, businessInstanceId)
  return {
    businessRegistrationId,
    businessInstanceId,
    instanceId,
    runtimeInstanceId: instanceId,
  }
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
