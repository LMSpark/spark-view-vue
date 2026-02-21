/**
 * Strategy/Delegate 共享类型
 *
 * 定义 DataView 向 Delegate 暴露的最小 Host 接口，
 * 遵循 ISP 原则：Delegate 只依赖自己需要的方法。
 */

import type { IDataRow, ViewStateEvent, CrudOperationConfig } from '../types'
import type { DataTable } from '../data-table'

// ─────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────

/** Delegate 向宿主发射 stateChanged 事件的回调签名 */
export type EmitStateChangedFn = (
  changeType: ViewStateEvent['changeType'],
  extra?: Partial<ViewStateEvent>
) => void

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
  /** 可读写，级联时需重置为 Idle */
  requestState: import('../types').RequestState
  /** 静默重置状态 */
  resetState(): void
  /** 走完整请求编排 */
  requestData(): Promise<void>
}

// ─────────────────────────────────────────────
// CRUD 操作配置解析接口
// ─────────────────────────────────────────────

/** CrudDelegate 内部需要从 DataTable 获取的配置 */
export interface ICrudConfigProvider {
  getCrudConfig(): CrudOperationConfig | undefined
}
