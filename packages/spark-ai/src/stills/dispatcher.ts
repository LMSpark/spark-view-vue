/**
 * Stills Registry + Dispatcher
 *
 * 这个文件只做两件事：
 * 1. 维护 still action 注册表；
 * 2. 负责统一分发执行流程（查找 → guard → validate → execute → patchLog）。
 */

import type { StillDefinition, StillResult, IStillSession, PatchEntry } from './types'

// ═══════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════

type AnyStill = StillDefinition<unknown, unknown>

const _registry = new Map<string, AnyStill>()

export function registerStill(still: AnyStill): void {
  _registry.set(still.action, still)
}

export function registerAll(stills: AnyStill[]): void {
  for (const still of stills) {
    _registry.set(still.action, still)
  }
}

export function getStill(action: string): AnyStill | undefined {
  return _registry.get(action)
}

export function getAllStills(): ReadonlyMap<string, AnyStill> {
  return _registry
}

/** 用于测试：清空注册表 */
export function clearRegistry(): void {
  _registry.clear()
}

// ═══════════════════════════════════════════════════════════
// Dispatcher helper
// ═══════════════════════════════════════════════════════════

function unknownActionResult(action: string): StillResult {
  return {
    ok: false,
    code: 'UNKNOWN_ACTION',
    msg: `未知动作: ${action}`,
    fix: '请先查 stills.capabilities 获取可用动作列表',
  }
}

function invalidParamsResult(action: string, validationError: string): StillResult {
  return {
    ok: false,
    code: 'INVALID_PARAMS',
    msg: validationError,
    fix: `请查 stills.actionSpec {"action":"${action}"} 获取正确参数格式`,
  }
}

function createPatchEntry(action: string, requestId: string, summary: string): PatchEntry {
  return {
    action,
    requestId,
    timestamp: Date.now(),
    summary,
  }
}

// ═══════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════

export function executeStill(
  action: string,
  params: unknown,
  session: IStillSession,
  requestId: string,
): StillResult {
  // 1. 查找动作定义
  const still = _registry.get(action)
  if (!still) {
    return unknownActionResult(action)
  }

  // 2. guard 负责检查当前会话上下文是否允许执行该动作
  const guardResult = still.guard(session)
  if (guardResult !== null) {
    return { ok: false, code: guardResult.code, msg: guardResult.msg, fix: guardResult.msg }
  }

  // 3. validate 只负责参数形状与最小业务约束，不做真正副作用
  const validationError = still.validate(params)
  if (validationError !== null) {
    return invalidParamsResult(action, validationError)
  }

  // 4. 执行动作；request/describe 都走同一个入口，差异只体现在 type 与 patchLog 写入规则
  const result: StillResult = still.execute(session, params)

  // 5. 只有成功的 request 动作才写 patchLog；describe 动作不产生变更日志
  if (result.ok && still.type === 'request') {
    session.patchLog.push(createPatchEntry(action, requestId, result.summary))
  }

  return result
}
