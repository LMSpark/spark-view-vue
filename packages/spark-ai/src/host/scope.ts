/**
 * 业务作用域工具函数。
 *
 * 职责：创建、归一化和转换业务作用域 ID。
 * 所有 ID 生成函数共享同一套校验逻辑，确保 registrationId 和 instanceId 合法。
 *
 * 调用流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. normalizeAiHostBusinessTarget() → 校验并修剪业务目标 ID    │
 * │ 2. createAiHostBusinessScope()     → 从目标生成完整作用域     │
 * │ 3. createAiHostBusinessSessionId() → 生成 "reg:instance" 格式 │
 * │ 4. createAiHostBusinessStorageKey()→ 生成 "spark-ai:reg:inst" │
 * │ 5. createAiHostStreamKey()         → 生成 SSE 流唯一 key      │
 * │ 6. toAiHostRuntimeScope()          → BusinessScope → RuntimeContext │
 * └──────────────────────────────────────────────────────────────┘
 *
 * ID 格式约定：
 * - sessionId:   registrationId:instanceId
 * - storageKey:  spark-ai:registrationId:instanceId
 * - streamKey:   registrationId::instanceId::eventModuleId::turnId（URI 编码后）
 */

import type { AiHostBusinessScope, AiHostBusinessRuntimeContext, AiHostBusinessTarget } from './types'

// ═══════════════════════════════════════════════════════
// 内部校验工具
// ═══════════════════════════════════════════════════════

/**
 * 校验字段为非空字符串。
 * 失败时抛出带有字段名的错误，便于调用方定位问题。
 */
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

// ═══════════════════════════════════════════════════════
// 目标校验
// ═══════════════════════════════════════════════════════

/**
 * 校验并归一化业务目标 ID。
 * 输入可以是 AiHostBusinessTarget 或 AiHostBusinessScope（取其中两个字段），
 * 返回裁剪后的最小目标对象。
 */
export function normalizeAiHostBusinessTarget(target: AiHostBusinessTarget): AiHostBusinessTarget {
  return {
    businessRegistrationId: normalizeRequiredText(target.businessRegistrationId, 'businessRegistrationId'),
    businessInstanceId: normalizeRequiredText(target.businessInstanceId, 'businessInstanceId'),
  }
}

// ═══════════════════════════════════════════════════════
// ID 生成
// ═══════════════════════════════════════════════════════

/**
 * 生成会话 ID。
 * 格式：registrationId:instanceId
 * 用途：作为 scope.instanceId 和 scope.runtimeInstanceId 的值。
 */
export function createAiHostBusinessSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return `${businessRegistrationId}:${businessInstanceId}`
}

/**
 * 从注册 ID + 实例 ID 生成完整业务作用域。
 * 内部调用 normalize 校验输入，再拼接 sessionId。
 */
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

/**
 * 生成浏览器存储 key。
 * 格式：spark-ai:registrationId:instanceId
 * 用途：在 localStorage / sessionStorage 中持久化会话状态。
 */
export function createAiHostBusinessStorageKey(scope: AiHostBusinessScope | AiHostBusinessTarget): string {
  const target = normalizeAiHostBusinessTarget(scope)
  return `spark-ai:${target.businessRegistrationId}:${target.businessInstanceId}`
}

/**
 * 生成 SSE 流唯一 key。
 * 格式：registrationId::instanceId::eventModuleId::turnId（各段 URI 编码后）
 * 用途：在 SSE 事件中标识流的归属，用于前端按流过滤事件。
 */
export function createAiHostStreamKey(scope: AiHostBusinessScope, eventModuleId: string, turnId: string): string {
  return [
    scope.businessRegistrationId,
    scope.businessInstanceId,
    eventModuleId,
    turnId,
  ].map(encodeURIComponent).join('::')
}

// ═══════════════════════════════════════════════════════
// 类型转换
// ═══════════════════════════════════════════════════════

/**
 * BusinessScope → RuntimeContext 映射。
 * 将业务作用域的字段名映射为运行时方法上下文所需的字段名：
 * - businessRegistrationId → moduleId
 * - businessInstanceId → moduleInstanceId
 * - instanceId → instanceId（同名）
 */
export function toAiHostRuntimeScope(scope: AiHostBusinessScope): AiHostBusinessRuntimeContext {
  return {
    moduleId: scope.businessRegistrationId,
    moduleInstanceId: scope.businessInstanceId,
    instanceId: scope.instanceId,
  }
}
