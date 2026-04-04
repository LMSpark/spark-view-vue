/**
 * Strategy/Delegate 共享类型
 *
 * 定义 DataView 向 Delegate 暴露的最小 Host 接口，
 * 遵循 ISP 原则：Delegate 只依赖自己需要的方法。
 */

import type { IDataRow, IDataSet, DataRelation, CrudResult, CrudOperationConfig, RequestState } from '../types'
import type { CrudService } from '../crud-service'
import type { DataValidator } from '../validation'

// ─────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────

/** SelectionDelegate 向宿主发射 currentRow 变更的回调签名 */
export type EmitCurrentRowChangedFn = (originatorId?: string) => void

/** SelectionDelegate 向宿主发射 selectedRows 变更的回调签名 */
export type EmitSelectedRowsChangedFn = (originatorId?: string) => void

/** LocalMutationDelegate 向宿主发射 rows 变更的回调签名 */
export type EmitRowsChangedFn = () => void

/**
 * LocalMutationDelegate 变更后的后处理回调（计算列求值 + 聚合重算）。
 * 在 emitRowsChanged 之前、同步调用。
 *
 * - `IDataRow[]`：仅对这些行重新求值计算列，再重算聚合
 * - `'all'`：全量行重新求值计算列，再重算聚合
 * - `null`：跳过计算列求值（删除行场景），只重算聚合
 */
export type PostMutationFn = (affectedRows: IDataRow[] | 'all' | null) => void

/** CascadeDelegate 向宿主发射 cleared 事件的回调签名 */
export type EmitClearedFn = () => void

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
  /** 主键字段名（始终为单字符串；多列 PK 通过 _pk 合成列统一为标量） */
  readonly primaryKey: string
  /** 获取行的主键值（用于 Map/Set/=== 内部比较） */
  getPkKey(row: IDataRow): string | number | undefined
  /** 实际生效的主键字段名列表（不含合成列 _pk），供委托校验/遍历真实字段 */
  readonly effectivePkFields: string[]
}

/**
 * 选中状态存储（主键形式）
 *
 * 可变契约：委托（SelectionDelegate / LocalMutationDelegate）
 * 通过此接口直接写入宿主的选中状态字段。
 * 这是有意设计——性能优先（避免 setter 层开销）且
 * 确保直接属性写入可被外部包装层（如 Proxy）正确追踪。
 *
 * @internal 仅供 spark-data 内部委托使用，外部不应直接操作这些字段。
 */
export interface ISelectionState {
  /** @internal 当前行主键值——委托可写 */
  _currentRowId: string | number | null
  /** @internal 多选行主键值列表——委托通过整体赋值维护（shallowReactive 友好） */
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
  isDestroyed(): boolean

  // ── 值序列化配置（value / labels / label 计算所需）──
  readonly valueField?: string | string[]
  readonly labelField?: string
  readonly selectionDelimiter: string
  readonly isMultiSelect: boolean
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
  // ── 行数据（覆盖 IRowStore.readonly 为可写，shallowReactive 整体赋值触发响应式） ──
  rows: IDataRow[]

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

  /** 已注册计算列名集合（提交前剥离） */
  readonly computedColumnNames: ReadonlySet<string>
  /** 从数据对象中移除计算列字段（浅拷贝，无计算列时返回原对象） */
  stripComputedColumns(data: Partial<IDataRow>): Partial<IDataRow>

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
// SaveChanges 宿主接口（saveChanges 执行上下文）
// ─────────────────────────────────────────────

/**
 * DirtyTrackingDelegate.executeChanges() 所需的宿主能力（ISP 最小子集）。
 *
 * DataView 实现此接口，executeChanges 通过此接口完成三阶段提交
 * （pending create → dirty update → pending delete）。
 */
export interface ISaveChangesHost {
  readonly rows: IDataRow[]
  /** 主键字段名（fallback PK payload 所用） */
  readonly primaryKey: string
  /** 获取行的标量主键值 */
  getPkKey(row: IDataRow): string | number | undefined
  /** 从行构建服务端 PK payload（用于 CRUD HTTP 请求） */
  buildServerPk(row: IDataRow): Record<string, unknown>
  /** 从数据对象中移除计算列字段（浅拷贝） */
  stripComputedColumns(data: Partial<IDataRow>): Partial<IDataRow>
  /** 按主键删除一行 */
  deleteRowById(id: string | number): boolean
  /** 追加一行到 rows */
  appendRow(row: IDataRow): void
}

/**
 * saveChanges 批量提交所需的 CRUD 网络操作接口（ISP 最小子集）。
 *
 * DirtyTrackingDelegate.executeChanges() 通过此接口提交数据，
 * 解耦 DataView facade 方法与 CRUD 网络层。
 */
export interface ICrudNetworkOps {
  createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>>
  updateRecord(id: string | number, data: Partial<IDataRow>, serverPk?: Record<string, unknown>): Promise<CrudResult<IDataRow>>
  deleteRecord(id: string | number, serverPk?: Record<string, unknown>): Promise<CrudResult<boolean>>
}



/**
 * CascadeDelegate 所需的宿主能力
 */
export interface ICascadeHost extends IViewIdentity {
  /** DataSet（沿 parent 链向上访问；DataTable 尚未绑定时为 undefined） */
  readonly dataSet: IDataSet | undefined
  /** 只读，级联时检查状态 */
  readonly requestState: RequestState
  /**
   * CrudService 实例（未配置 API 时为 undefined）。
   * CascadeDelegate 用此字段判断是走网络加载还是内存过滤。
   */
  readonly crudService: CrudService | undefined
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
  /**
   * 无 API 时的内存级联过滤。
   * 从源 DataTable.rows 中按 rel.childField === parentRow[parentField|'id'] 过滤，
   * 结果直接写入视图（相当于一次无网络的 loadFromServer）。
   */
  applyInMemoryCascade(rel: DataRelation, parentRows: readonly IDataRow[]): void
}

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

/** Delegate 向宿主发射 CRUD 生命周期事件的回调签名 */
export type EmitCrudLifecycleFn = (event: CrudLifecycleEvent) => void
