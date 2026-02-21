/**
 * Strategy/Delegate 共享类型
 *
 * 定义 DataView 向 Delegate 暴露的最小 Host 接口，
 * 遵循 ISP 原则：Delegate 只依赖自己需要的方法。
 */

import type { IDataRow, ViewStateEvent, CrudResult } from '../types'
import type { DataTable } from '../data-table'

// ─────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────

/** Delegate 向宿主发射 stateChanged 事件的回调签名 */
export type EmitStateChangedFn = (
  changeType: ViewStateEvent['changeType'],
  extra?: Partial<ViewStateEvent>
) => void

/**
 * CrudDelegate 向宿主汇报 mutating 状态变化的回调签名
 * - delta=1 : 开始一个 CRUD 网络请求
 * - delta=-1 : 结束一个 CRUD 网络请求（error=null 表示成功）
 */
export type MutatingFn = (delta: 1 | -1, error?: Error | null) => void

// ─────────────────────────────────────────────
// CrudDelegate Host 接口
// ─────────────────────────────────────────────

/**
 * CrudDelegate 所需的宿主能力（ISP 最小子集）
 *
 * DataView 实现此接口，CrudDelegate 仅通过此接口与宿主交互。
 */
export interface ICrudHost {
  readonly rows: IDataRow[]
  readonly primaryKey: string
  readonly dataTable: DataTable

  /** 追加一行到 rows */
  appendRow(row: IDataRow): void
  /** 按主键更新一行 */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean
  /** 按主键删除一行 */
  deleteRowById(id: string | number): boolean
  /** 静默重置状态（requestState→Idle，清空行和选中） */
  resetState(): void
  /** 走完整请求编排 */
  requestData(): Promise<void>
}

// ─────────────────────────────────────────────
// CascadeDelegate Host 接口
// ─────────────────────────────────────────────

/**
 * CascadeDelegate 所需的宿主能力
 */
export interface ICascadeHost {
  readonly tableName: string
  readonly viewId: string
  readonly dataTable: DataTable
  /** 只读，级联时检查状态 */
  readonly requestState: import('../types').RequestState
  /** 静默重置状态（requestState→Idle，清空行和选中） */
  resetState(): void
  /**
   * 走完整请求编排（幂等：requestState≠Idle 时直接返回）
   * 上行触发（UI/脚本主动请求）用此方法。
   */
  requestData(): Promise<void>
  /**
   * 强制刷新：先 resetState() 再 requestData()
   * 下行触发（父数据变化→级联子视图）用此方法。
   */
  refresh(): Promise<void>
}

// ─────────────────────────────────────────────
// CRUD 生命周期事件
// ─────────────────────────────────────────────

/** CRUD 操作类型 */
export type CrudOperation =
  | 'create' | 'update' | 'delete'
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
  result?: CrudResult | undefined,
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

/** Delegate 向宿主发射 CRUD 生命周期事件的回调签名 */
export type EmitCrudLifecycleFn = (event: CrudLifecycleEvent) => void
