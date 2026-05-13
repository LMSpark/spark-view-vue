import type { AppAiBusinessScope } from './types'

export function createAppAiStreamKey(scope: AppAiBusinessScope, eventModuleId: string, turnId: string): string {
  return [
    scope.businessRegistrationId,
    scope.businessInstanceId,
    eventModuleId,
    turnId,
  ].map(encodeURIComponent).join('::')
}

export function toRuntimeScope(scope: AppAiBusinessScope): {
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  runtimeInstanceId: string
} {
  return {
    moduleId: scope.businessRegistrationId,
    moduleInstanceId: scope.businessInstanceId,
    instanceId: scope.instanceId,
    runtimeInstanceId: scope.runtimeInstanceId,
  }
}
