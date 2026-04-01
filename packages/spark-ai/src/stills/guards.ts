/**
 * Guard 检查器 — 声明式准入校验
 *
 * 根据 StillGuard 声明和当前 session 状态判断动作是否允许执行。
 * 返回 null 表示通过，否则返回 StillResult 错误。
 */

import type { StillGuard, StillResult, DesignSessionV2 } from './types'

export function checkGuard(guard: StillGuard, session: DesignSessionV2): StillResult | null {
  // requireDataset 默认 true
  const needDataset = guard.requireDataset !== false
  if (needDataset && session.dataset === null) {
    return {
      ok: false,
      code: 'NO_DATASET',
      msg: 'Dataset 尚未初始化',
      fix: '请先执行 dataset.init 创建 DataSet',
    }
  }

  if (guard.requireBlueprint === true && session.blueprint === null) {
    return {
      ok: false,
      code: 'NO_BLUEPRINT',
      msg: 'Blueprint 尚未创建',
      fix: '请先执行 blueprint.create 生成蓝图',
    }
  }

  if (guard.requireSchemaUnlocked === true && session.schemaLocked) {
    return {
      ok: false,
      code: 'SCHEMA_LOCKED',
      msg: 'Schema 已锁定，不允许此操作',
      fix: '当前处于视图/API 阶段，表结构与关系已锁。如需修改请先 schema.unlock',
    }
  }

  if (guard.requireSchemaLocked === true && !session.schemaLocked) {
    return {
      ok: false,
      code: 'SCHEMA_NOT_LOCKED',
      msg: 'Schema 尚未锁定',
      fix: '视图/API/依赖配置需在 schema.lock 之后执行。请先完成表结构和关系，然后 schema.lock',
    }
  }

  return null
}
