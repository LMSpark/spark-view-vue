/**
 * 业务作用域工具函数。
 *
 * 职责：创建、归一化和转换业务作用域 ID。
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                    scope 工具函数                          │
 * │                                                           │
 * │  normalizeAiHostBusinessTarget() → 校验并修剪文本          │
 * │  createAiHostBusinessScope()     → 从注册 ID + 实例 ID     │
 * │                                     生成完整 scope          │
 * │  createAiHostBusinessSessionId() → "reg:instance" 格式     │
 * │  createAiHostBusinessStorageKey()→ "spark-ai:reg:instance" │
 * │  createAiHostStreamKey()         → "reg::instance::module   │
 * │                                    ::turnId" 流 key         │
 * │  toAiHostRuntimeScope()          → BusinessScope →         │
 * │                                    RuntimeContext 转换      │
 * └──────────────────────────────────────────────────────────┘
 */

import type { AiHostBusinessScope, AiHostBusinessRuntimeContext, AiHostBusinessTarget } from './types'

/** 校验字段为非空字符串 */
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

/** 校验并归一化业务目标 ID */
export function normalizeAiHostBusinessTarget(target: AiHostBusinessTarget): AiHostBusinessTarget {
  return {
    businessRegistrationId: normalizeRequiredText(target.businessRegistrationId, 'businessRegistrationId'),
    businessInstanceId: normalizeRequiredText(target.businessInstanceId, 'businessInstanceId'),
  }
}

/** 生成会话 ID：注册 ID:实例 ID */
export function createAiHostBusinessSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return `${businessRegistrationId}:${businessInstanceId}`
}

/** 从注册 ID + 实例 ID 生成完整业务作用域 */
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

/** 生成浏览器存储 key：spark-ai:reg:instance */
export function createAiHostBusinessStorageKey(scope: AiHostBusinessScope | AiHostBusinessTarget): string {
  const target = normalizeAiHostBusinessTarget(scope)
  return `spark-ai:${target.businessRegistrationId}:${target.businessInstanceId}`
}

/** 生成 SSE 流 key：reg::instance::eventModule::turnId */
export function createAiHostStreamKey(scope: AiHostBusinessScope, eventModuleId: string, turnId: string): string {
  return [
    scope.businessRegistrationId,
    scope.businessInstanceId,
    eventModuleId,
    turnId,
  ].map(encodeURIComponent).join('::')
}

/** BusinessScope → RuntimeContext 转换：映射字段名 */
export function toAiHostRuntimeScope(scope: AiHostBusinessScope): AiHostBusinessRuntimeContext {
  return {
    moduleId: scope.businessRegistrationId,
    moduleInstanceId: scope.businessInstanceId,
    instanceId: scope.instanceId,
  }
}
