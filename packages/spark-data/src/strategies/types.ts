/**
 * Strategy/Delegate shared domain types.
 *
 * Host shape aliases used to live here. They were single-implementation
 * abstractions over DataView, so delegates now depend on the concrete class.
 */

import type { CrudResult } from '../types'

// ─────────────────────────────────────────────
// CRUD 生命周期事件
// ─────────────────────────────────────────────

/** CRUD 操作类型 */
export type CrudOperation =
  | 'retrieve' | 'create' | 'update' | 'delete'
  | 'batchCreate' | 'batchUpdate' | 'batchDelete'
  | 'import'

/**
 * CRUD 生命周期事件
 *
 * - `before` 阶段：业务脚本可调用 `cancel()` 取消操作（如弹窗确认、权限二次校验）
 * - `after` 阶段：业务脚本可根据 result 执行联动（如刷新关联表、弹出提示）
 */
export interface CrudLifecycleEvent {
  readonly operation: CrudOperation
  readonly phase: 'before' | 'after'
  /** 提交的数据（before 阶段为原始入参，after 阶段同前） */
  readonly data: unknown
  /** 操作结果（仅 after 阶段） */
  result?: CrudResult | undefined
  /** 是否已取消（仅 before 阶段有效） */
  cancelled: boolean
  /** 取消操作（仅 before 阶段调用） */
  cancel(): void
}

/** 创建 CRUD 生命周期事件实例 */
export function createCrudLifecycleEvent(
  operation: CrudOperation,
  phase: 'before' | 'after',
  data: unknown,
  result?: CrudResult,
): CrudLifecycleEvent {
  const event: CrudLifecycleEvent = {
    operation,
    phase,
    data,
    result,
    cancelled: false,
    cancel() { event.cancelled = true },
  }
  return event
}
