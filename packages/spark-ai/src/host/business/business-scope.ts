/**
 * ═══════════════════════════════════════════════════════════════
 * host/business/business-scope.ts — 业务作用域工厂函数
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】纯函数工具集。负责从原始 ID 字符串构造类型安全的
 *   AiHostBusinessScope / AiHostBusinessRuntimeContext 等作用域对象。
 *
 * 【设计原则】
 *   - 所有输入字符串都经过 normalizeRequiredText 校验（非空、去空白）
 *   - sessionId = "registrationId:instanceId"（冒号拼接，全局唯一）
 *   - storageKey 用于 localStorage / Map 等存储后端的键名
 *   - streamKey 用于 SSE 事件流的键名（多段 URI 编码拼接）
 *
 * 【函数清单】
 *   normalizeAiHostBusinessTarget     — 规范化业务定位（校验 + 去空白）
 *   createAiHostBusinessSessionId     — 生成会话 ID
 *   createAiHostBusinessScope         — 构造业务作用域
 *   createAiHostBusinessStorageKey    — 生成存储键
 *   createAiHostStreamKey             — 生成 SSE 流键
 *   toAiHostRuntimeScope              — Scope → RuntimeContext 投影
 *   latestUserInput                   — 从请求历史中提取最新用户消息
 *
 * 【消费方】business-session、fetch-transport、tool-loop-runner
 * ═══════════════════════════════════════════════════════════════
 */

import {
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
} from './business-types'
import type { AiHostChatRequest } from '../chat/chat-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 输入校验
// ═══════════════════════════════════════════════════════════════

/** 校验必填文本字段：必须是非空字符串，去除首尾空白后不能为空 */
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

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 作用域工厂
// ═══════════════════════════════════════════════════════════════

/** 规范化业务定位：校验 registrationId 和 instanceId 均非空 */
export function normalizeAiHostBusinessTarget(target: AiHostBusinessTarget): AiHostBusinessTarget {
  return new AiHostBusinessTarget(
    normalizeRequiredText(target.businessRegistrationId, 'businessRegistrationId'),
    normalizeRequiredText(target.businessInstanceId, 'businessInstanceId'),
  )
}

/** 生成会话 ID：格式为 "registrationId:instanceId" */
export function createAiHostBusinessSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return `${businessRegistrationId}:${businessInstanceId}`
}

/** 构造业务作用域（含输入校验） */
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

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 键名生成
// ═══════════════════════════════════════════════════════════════

/** 生成存储键：格式为 "spark-ai:registrationId:instanceId" */
export function createAiHostBusinessStorageKey(scope: AiHostBusinessScope | AiHostBusinessTarget): string {
  const target = normalizeAiHostBusinessTarget(scope)
  return `spark-ai:${target.businessRegistrationId}:${target.businessInstanceId}`
}

/**
 * 生成 SSE 事件流键。
 * 格式：encodeURIComponent(registrationId)::encodeURIComponent(instanceId)::encodeURIComponent(moduleId)::encodeURIComponent(turnId)
 * 使用 :: 双冒号分隔以避免与 URI 编码后的字符冲突。
 */
export function createAiHostStreamKey(scope: AiHostBusinessScope, eventModuleId: string, turnId: string): string {
  return [
    scope.businessRegistrationId,
    scope.businessInstanceId,
    eventModuleId,
    turnId,
  ].map(encodeURIComponent).join('::')
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 类型投影
// ═══════════════════════════════════════════════════════════════

/** Scope → RuntimeContext 投影：摘取 moduleId / moduleInstanceId / instanceId */
export function toAiHostRuntimeScope(scope: AiHostBusinessScope): AiHostBusinessRuntimeContext {
  return new AiHostBusinessRuntimeContext(
    scope.businessRegistrationId,
    scope.businessInstanceId,
    scope.instanceId,
  )
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 用户输入提取
// ═══════════════════════════════════════════════════════════════

/**
 * 从请求历史中提取最新一条用户消息。
 * 从 historyMsgs 末尾向前遍历，找到第一个 role === 'user' 的消息。
 * 若无用户消息则返回空字符串。
 *
 * SSOT：本函数是 latestUserInput 的唯一定义点，
 * business-session 和 tool-loop-runner 都从此处导入。
 */
export function latestUserInput(request: AiHostChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}
