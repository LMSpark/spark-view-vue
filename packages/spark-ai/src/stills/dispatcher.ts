/**
 * Stills Registry + Dispatcher
 *
 * - registerStill(): 注册单个动作
 * - registerAll(): 批量注册
 * - getStill(): 按 action 名查询
 * - getAllStills(): 获取全部注册动作
 * - executeStill(): 守卫检查 → 参数校验 → 执行 → 写日志
 */

import type { StillDefinition, StillResult, DesignSessionV2, PatchEntry } from './types'
import { checkGuard } from './guards'

// ─── Registry ──────────────────────────────────────────────

const _registry = new Map<string, StillDefinition>()

export function registerStill(still: StillDefinition): void {
  _registry.set(still.action, still)
}

export function registerAll(stills: StillDefinition[]): void {
  for (const s of stills) {
    _registry.set(s.action, s)
  }
}

export function getStill(action: string): StillDefinition | undefined {
  return _registry.get(action)
}

export function getAllStills(): ReadonlyMap<string, StillDefinition> {
  return _registry
}

/** 用于测试：清空注册表 */
export function clearRegistry(): void {
  _registry.clear()
}

// ─── Dispatcher ────────────────────────────────────────────

export function executeStill(
  action: string,
  params: unknown,
  session: DesignSessionV2,
  requestId: string,
): StillResult {
  // 1. 查找动作
  const still = _registry.get(action)
  if (!still) {
    return {
      ok: false,
      code: 'UNKNOWN_ACTION',
      msg: `未知动作: ${action}`,
      fix: '请先查 stills.capabilities 获取可用动作列表',
    }
  }

  // 2. Guard 检查
  const guardResult = checkGuard(still.guard, session)
  if (guardResult !== null) {
    return guardResult
  }

  // 3. 参数校验
  const validationError = still.validate(params)
  if (validationError !== null) {
    return {
      ok: false,
      code: 'INVALID_PARAMS',
      msg: validationError,
      fix: `请查 stills.actionSpec {"action":"${action}"} 获取正确参数格式`,
    }
  }

  // 4. 执行
  const result = still.execute({ session }, params)

  // 5. 写入 patchLog（仅成功的 request 类型）
  if (result.ok && still.type === 'request') {
    const entry: PatchEntry = {
      action,
      requestId,
      timestamp: Date.now(),
      summary: result.summary,
    }
    session.patchLog.push(entry)
  }

  return result
}
