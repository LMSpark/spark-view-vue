/**
 * Strategy/Delegate 共享类型
 *
 * 定义 DataView 向 Delegate 暴露的最小 Host 接口，
 * 遵循 ISP 原则：Delegate 只依赖自己需要的方法。
 */

import type { IDataRow, IDataSet, CrudResult, CrudOperationConfig } from '../types'
import type { CrudService } from '../crud-service'
import type { DataValidator } from '../validation'

// ─────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────

/**
 * Delegate 向宿主发射 stateChanged 事件的回调签名
 *
 * 使用函数重载与 ViewStateEvent 判别联合对齐：
 * - `currentRow`   → 必须传 `{ row }`
 * - `selectedRows` → 必须传 `{ rows }`
 * - 其余变化类型   → 无额外字段
 */
export interface EmitStateChangedFn {
  (changeType: 'currentRow', extra: { row: IDataRow | null; originatorId?: string }): void
  (changeType: 'selectedRows', extra: { rows: IDataRow[]; originatorId?: string }): void
  (changeType: 'rows' | 'cleared' | 'requestState' | 'mutating'): void
}

/**
 * CrudDelegate 向宿主汇报 mutating 状态变化的回调签名
 * - delta=1 : 开始一个 CRUD 网络请求
 * - delta=-1 : 结束一个 CRUD 网络请求（error=null 表示成功）
 */
export type MutatingFn = (delta: 1 | -1, error?: Error | null) => void

// ─────────────────────────────────────────────
// 共享基础接口
// ─────────────────────────────────────────────

/** 视图标识（tableName + viewId） */
export interface IViewIdentity {
  readonly tableName: string
  readonly viewId: string
}

/** 行存储 + 主键访问 */
export interface IRowStore {
  readonly rows: IDataRow[]
  readonly primaryKey: string | string[]
  getPrimaryKeyValue(row: IDataRow): string | number | undefined
}

/**
 * 选中状态存储（主键形式）
 *
 * 可变契约：委托（SelectionDelegate / LocalMutationDelegate）
 * 通过此接口直接写入宿主的选中状态字段。
 * 这是有意设计——性能优先（避免 setter 层开销）且
 * 保持与 Vue reactive() 包装后的响应式追踪兼容。
 *
 * @internal 仅供 spark-data 内部委托使用，外部不应直接操作这些字段。
 */
export interface ISelectionState {
  /** @internal 当前行主键值——委托可写 */
  _currentRowId: string | number | null
  /** @internal 多选行主键值列表——委托通过 splice 维护（保持数组引用稳定） */
  _selectedRowIds: Array<string | number>
  /** 只读 getter，按 _currentRowId 从 rows 解析行对象 */
  readonly currentRow: IDataRow | null
  /** 只读 getter，按 _selectedRowIds 从 rows 过滤行对象数组 */
  readonly selectedRows: IDataRow[]
}

// ─────────────────────────────────────────────
// SelectionDelegate Host 接口
// ─────────────────────────────────────────────

/**
 * SelectionDelegate 所需的宿主能力（ISP 最小子集）
 *
 * DataView 实现此接口，SelectionDelegate 仅通过此接口访问宿主状态。
 * 选中状态以主键值存储，委托写入 _currentRowId / _selectedRowIds；
 * currentRow / selectedRows 是宿主 DataView 上的 getter（按需从 rows 解析），委托只读。
 */
export interface ISelectionHost extends IViewIdentity, IRowStore, ISelectionState {
  readonly autoCurrentFirst: boolean
  readonly autoSelectFirst: boolean
  readonly selectionFollowsCurrent: boolean
  isDestroyed(): boolean
}

// ─────────────────────────────────────────────
// LocalMutationDelegate Host 接口
// ─────────────────────────────────────────────

/**
 * LocalMutationDelegate 所需的宿主能力（ISP 最小子集）
 *
 * 涵盖本地行数据写入所需的所有可变字段及辅助方法。
 * 选中状态以主键值存储，委托通过 ISelectionState 可变契约写入。
 *
 * @see ISelectionState 可变契约说明
 */
export interface ILocalMutationHost extends IViewIdentity, IRowStore, ISelectionState {
  // ── 分页（委托直接写入） ──────────────────
  total: number
  page: number
  pageSize: number

  // ── 行索引缓存（updateRowById 行对象替换时原地更新）──
  rowIndexMap?: Map<IDataRow, number> | undefined

  // ── 工具方法 ──────────────────────────────
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
export interface ICrudHost extends IRowStore {
  /** 表名（用于错误信息） */
  readonly tableName: string
  /** CrudService 实例（来自 DataTable，未配置 API 时为 undefined） */
  readonly crudService: CrudService | undefined
  /** CRUD 操作全局配置 */
  readonly crudConfig: CrudOperationConfig | undefined
  /** 数据校验器 */
  readonly validator: DataValidator | undefined

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
export interface ICascadeHost extends IViewIdentity {
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
