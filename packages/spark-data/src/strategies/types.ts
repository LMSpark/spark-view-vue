/**
 * Strategy/Delegate 共享类型
 *
 * 定义 DataView 向 Delegate 暴露的最小 Host 接口，
 * 遵循 ISP 原则：Delegate 只依赖自己需要的方法。
 */

import type { IDataRow, IDataSet, ViewStateEvent, CrudResult, CrudOperationConfig } from '../types'
import type { CrudService } from '../crud-service'
import type { DataValidator } from '../validation'

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
// SelectionDelegate Host 接口
// ─────────────────────────────────────────────

/**
 * SelectionDelegate 所需的宿主能力（ISP 最小子集）
 *
 * DataView 实现此接口，SelectionDelegate 仅通过此接口访问宿主状态。
 * 可写字段（currentRow / selectedRows 等）由委托直接修改——
 * 与 DataView 字段同引用，无需回调。
 */
export interface ISelectionHost {
  // ── 只读配置 ──────────────────────────────
  readonly rows: IDataRow[]
  readonly tableName: string
  readonly viewId: string
  readonly primaryKey: string | string[]
  readonly autoCurrentFirst: boolean
  readonly autoSelectFirst: boolean
  readonly selectionFollowsCurrent: boolean

  // ── 选中状态（委托直接写入，DataView 读同变更） ──
  currentRow: IDataRow | null
  currentRowIndex: number | null
  selectedRows: IDataRow[]          // 委托通过 splice 操作，保持数组引用稳定（Vue 响应式友好）
  selectedRowIndices: number[]
  rowIndexMap?: Map<IDataRow, number> | undefined  // 索引缓存，委托负责懒建与失效

  // ── 工具方法 ──────────────────────────────
  getPrimaryKeyValue(row: IDataRow): string | number | undefined
  isDestroyed(): boolean
}

// ─────────────────────────────────────────────
// LocalMutationDelegate Host 接口
// ─────────────────────────────────────────────

/**
 * LocalMutationDelegate 所需的宿主能力（ISP 最小子集）
 *
 * 涵盖本地行数据写入所需的所有可变字段及辅助方法。
 * 可写字段由委托直接修改，与 DataView 同引用，Vue 响应式兼容。
 */
export interface ILocalMutationHost {
  // ── 行数据（委托直接 splice） ───────────────
  readonly rows: IDataRow[]
  readonly tableName: string
  readonly viewId: string
  readonly primaryKey: string | string[]

  // ── 分页（委托直接写入） ──────────────────
  total: number
  page: number
  pageSize: number

  // ── 选中状态（updateRowById/deleteRowById/replaceRows 同步引用） ──
  currentRow: IDataRow | null
  currentRowIndex: number | null
  selectedRows: IDataRow[]
  selectedRowIndices: number[]
  rowIndexMap?: Map<IDataRow, number> | undefined

  // ── 工具方法 ──────────────────────────────
  getPrimaryKeyValue(row: IDataRow): string | number | undefined
  isDestroyed(): boolean
}

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
  readonly primaryKey: string | string[]
  /** 表名（用于错误信息） */
  readonly tableName: string
  /** CrudService 实例（来自 DataTable，未配置 API 时为 undefined） */
  readonly crudService: CrudService | undefined
  /** CRUD 操作全局配置 */
  readonly crudConfig: CrudOperationConfig | undefined
  /** 数据校验器 */
  readonly validator: DataValidator | undefined

  /** 获取行的主键值（用于 Map/Set 键） */
  getPrimaryKeyValue(row: IDataRow): string | number | undefined
  /** 追加一行到 rows */
  appendRow(row: IDataRow): void
  /** 按主键更新一行 */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean
  /** 按主键删除一行 */
  deleteRowById(id: string | number): boolean
  /** 静默重置状态（requestState→Idle，清空行和选中） */
  resetState(): void
  /** 走完整请求编排（非阻塞，结果经 stateChanged 事件通知） */
  requestData(): void
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
  /** DataSet（沿 parent 链向上访问） */
  readonly dataSet: IDataSet
  /** 只读，级联时检查状态 */
  readonly requestState: import('../types').RequestState
  /** 静默重置状态（requestState→Idle，清空行和选中） */
  resetState(): void
  /**
   * 走完整请求编排（幂等：requestState≠Idle 时直接返回）
   * 上行触发（UI/脚本主动请求）用此方法。非阻塞，结果经 stateChanged 事件通知。
   */
  requestData(): void
  /**
   * 强制刷新：先 resetState() 再 requestData()
   * 下行触发（父数据变化→级联子视图）用此方法。非阻塞，结果经 stateChanged 事件通知。
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
