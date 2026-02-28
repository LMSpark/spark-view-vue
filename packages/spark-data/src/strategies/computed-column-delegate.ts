/**
 * ComputedColumnDelegate — 计算列委托
 *
 * 统一封装计算列的全部职责：
 * - 表达式编译（`new Function` + `with` 沙箱，行字段直接引用）
 * - 子视图聚合函数（`$sum` / `$count` / `$avg` / `$min` / `$max` / `$list`）
 * - 配置驱动（DataColumn.computeExpression）编译 & 注册
 * - 编程式注册（函数 / 表达式字符串）
 * - 数据加载后自动求值（apply）
 * - CRUD 提交前剥离（strip）
 *
 * ## 表达式格式
 * ```
 * "price * qty"
 * "firstName + ' ' + lastName"
 * "ctx.taxRate ? amount * ctx.taxRate : amount"
 *
 * // 子视图聚合（需配置 DataRelation，第一个参数为 '子表名' 或 '子表名@视图ID'）
 * "$sum('OrderItems', 'amount')"
 * "$sum('OrderItems@grid', 'amount')"
 * "$count('OrderItems')"
 * "$avg('Scores', 'score')"
 * "$min('Bids', 'price')"
 * "$max('Bids', 'price')"
 * "$list('Tags', 'name').join(', ')"
 * ```
 *
 * 通过 IComputedHost 接口与宿主（DataView）交互，不直接依赖 DataView 类。
 */

import { Logger } from '@spark-view/spark-utils'
import type { IDataRow, DataColumn, DataRelation, IDataSet, ComputedColumnFn } from '../types'
import type { IViewIdentity } from './types'

const logger = Logger('DataView:Computed')

// ─────────────────────────────────────────────
// 类型 & 接口
// ─────────────────────────────────────────────

/** 表达式求值时可传入的外部上下文（在表达式中以 `ctx` 变量引用） */
export type ComputedColumnContext = Record<string, unknown>

/**
 * 聚合解析器——将 "子表引用 + 父行" 映射为匹配的子行集合。
 *
 * 子表引用格式：`'子表名'` 或 `'子表名@视图ID'`
 */
export interface AggregateResolver {
  resolveChildRows(childRef: string, parentRow: IDataRow): IDataRow[]
}

/**
 * ComputedColumnDelegate 所需的宿主能力（ISP 最小子集）
 */
export interface IComputedHost extends IViewIdentity {
  readonly primaryKey: string | string[]
  readonly rows: IDataRow[]
  /** DataTable 列定义（DataTable 未 attach 时为 undefined） */
  readonly tableColumns: DataColumn[] | undefined
  /** DataSet 引用（用于聚合解析器，未就绪时为 undefined） */
  readonly tableDataSet: IDataSet | undefined
}

// ─────────────────────────────────────────────
// 表达式编译器（原 core/computed-column.ts）
// ─────────────────────────────────────────────

/** 检测表达式中是否含有聚合函数调用 */
const AGG_PATTERN = /\$(?:sum|count|avg|min|max|list)\s*\(/

/**
 * 将表达式字符串编译为 ComputedColumnFn。
 *
 * - 行字段直接引用（`with(__row)` 解构），无需前缀
 * - 外部上下文通过 `ctx` 参数
 * - 子视图聚合通过 `$sum` 等注入函数（需提供 `resolver`）
 *
 * @throws 编译期语法错误；运行期错误由 ComputedColumnDelegate._apply 捕获
 *
 * @example
 * compileExpression('price * qty')
 * compileExpression('amount * ctx.taxRate', { taxRate: 0.13 })
 * compileExpression("$sum('Items', 'amount')", undefined, resolver)
 */
export function compileExpression(
  expression: string,
  ctx?: ComputedColumnContext,
  resolver?: AggregateResolver,
): ComputedColumnFn {
  const frozenCtx = ctx ? Object.freeze({ ...ctx }) : undefined
  const hasAgg = resolver !== undefined && AGG_PATTERN.test(expression)

  if (!hasAgg) {
    // 快速路径：无聚合函数
    const compiled = new Function('__row', 'ctx', `with(__row) { return (${expression}) }`) as (
      row: IDataRow, ctx: ComputedColumnContext | undefined,
    ) => unknown
    return (row: IDataRow) => compiled(row, frozenCtx)
  }

  // 聚合路径：注入 $sum/$count/$avg/$min/$max/$list
  const compiled = new Function(
    '__row', '$sum', '$count', '$avg', '$min', '$max', '$list', 'ctx',
    `with(__row) { return (${expression}) }`,
  ) as (
    row: IDataRow,
    $sum: (t: string, f: string) => number,
    $count: (t: string) => number,
    $avg: (t: string, f: string) => number,
    $min: (t: string, f: string) => number | undefined,
    $max: (t: string, f: string) => number | undefined,
    $list: (t: string, f: string) => unknown[],
    ctx: ComputedColumnContext | undefined,
  ) => unknown

  // 可变引用——逐行切换，避免每行创建新函数
  let _row: IDataRow
  const _cache = new Map<string, IDataRow[]>()

  const getChildRows = (ref: string): IDataRow[] => {
    let cached = _cache.get(ref)
    if (cached === undefined) {
      cached = resolver.resolveChildRows(ref, _row)
      _cache.set(ref, cached)
    }
    return cached
  }

  const $sum   = (t: string, f: string): number => getChildRows(t).reduce((a, r) => a + Number(r[f] ?? 0), 0)
  const $count = (t: string): number => getChildRows(t).length
  const $avg   = (t: string, f: string): number => {
    const rows = getChildRows(t)
    return rows.length === 0 ? 0 : rows.reduce((a, r) => a + Number(r[f] ?? 0), 0) / rows.length
  }
  const $min   = (t: string, f: string): number | undefined => {
    const rows = getChildRows(t)
    return rows.length === 0 ? undefined : Math.min(...rows.map(r => Number(r[f])))
  }
  const $max   = (t: string, f: string): number | undefined => {
    const rows = getChildRows(t)
    return rows.length === 0 ? undefined : Math.max(...rows.map(r => Number(r[f])))
  }
  const $list  = (t: string, f: string): unknown[] => getChildRows(t).map(r => r[f])

  return (row: IDataRow) => {
    _row = row
    _cache.clear()
    return compiled(row, $sum, $count, $avg, $min, $max, $list, frozenCtx)
  }
}

/**
 * 从 DataColumn[] 批量编译含 `computeExpression` 的列。
 * 编译失败的列跳过并打印警告，不中断其他列。
 */
export function compileColumnsExpressions(
  columns: Array<{ name: string; computeExpression?: string }>,
  ctx?: ComputedColumnContext,
  resolver?: AggregateResolver,
): Map<string, ComputedColumnFn> {
  const result = new Map<string, ComputedColumnFn>()
  for (const col of columns) {
    if (!col.computeExpression) continue
    try {
      result.set(col.name, compileExpression(col.computeExpression, ctx, resolver))
    } catch (error) {
      logger.warn(`计算列 "${col.name}" 表达式编译失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return result
}

// ─────────────────────────────────────────────
// ComputedColumnDelegate
// ─────────────────────────────────────────────

/**
 * 计算列委托
 *
 * 封装所有计算列逻辑，DataView 通过薄包装层对外暴露公开 API。
 */
export class ComputedColumnDelegate {

  private _columns = new Map<string, ComputedColumnFn>()
  private _context?: ComputedColumnContext

  constructor(private readonly host: IComputedHost) {}

  // ── 公开 API（由 DataView 薄包装转发）──────────────────

  /** 设置共享上下文（`ctx`），重编译配置列并对现有 rows 求值。 */
  setContext(ctx: ComputedColumnContext): void {
    this._context = ctx
    this._syncFromConfig()
    this._apply(this.host.rows)
  }

  /** 注册计算列（函数式）。注册后立即对现有 rows 求值。 */
  setColumn(name: string, fn: ComputedColumnFn): void {
    this._columns.set(name, fn)
    this._apply(this.host.rows)
  }

  /** 注册计算列（表达式字符串）。行字段直接引用，`ctx` 对象，`$sum` 等聚合函数。 */
  setExpression(name: string, expression: string): void {
    this._columns.set(name, compileExpression(expression, this._context, this._createResolver()))
    this._apply(this.host.rows)
  }

  /** 移除计算列定义（历史已求值数据保留）。 */
  remove(name: string): void {
    this._columns.delete(name)
  }

  /** 从 DataTable 列定义中编译 computeExpression 并注册（公开入口）。 */
  initFromConfig(): void {
    this._syncFromConfig()
    this._apply(this.host.rows)
  }

  /** 已注册的计算列名集合（CrudDelegate 用于提交前剥离）。 */
  get names(): ReadonlySet<string> {
    return new Set(this._columns.keys())
  }

  /** 对行集合执行所有计算列求值（就地写入）。无计算列时零开销。 */
  apply(rows: IDataRow[]): void {
    this._apply(rows)
  }

  /** 从数据对象中移除计算列字段，返回浅拷贝；无计算列时返回原对象。 */
  strip(data: Partial<IDataRow>): Partial<IDataRow> {
    if (this._columns.size === 0) return data
    const cleaned = { ...data }
    for (const name of this._columns.keys()) delete cleaned[name]
    return cleaned
  }

  /**
   * DataTable setter 触发的同步编译（内部调用）。
   * DataTable 刚 attach 时 rows 通常为空；若有数据则立即求值。
   */
  syncFromConfig(): void {
    this._syncFromConfig()
    if (this.host.rows.length > 0) this._apply(this.host.rows)
  }

  /** 释放所有状态（DataView.destroy 时调用）。 */
  destroy(): void {
    this._columns.clear()
    this._context = undefined
  }

  // ── 私有实现 ──────────────────────────────────────────

  private _apply(rows: IDataRow[]): void {
    if (this._columns.size === 0 || rows.length === 0) return
    for (const row of rows) {
      for (const [name, fn] of this._columns) {
        try { row[name] = fn(row) }
        catch { row[name] = undefined }
      }
    }
  }

  private _syncFromConfig(): void {
    const columns = this.host.tableColumns
    if (!columns?.length) return
    const compiled = compileColumnsExpressions(columns, this._context, this._createResolver())
    for (const [name, fn] of compiled) this._columns.set(name, fn)
  }

  /**
   * 构建子视图聚合解析器。
   *
   * 双重索引支持 `'子表名'` 和 `'子表名@视图ID'` 两种参数格式。
   * 无 DataSet 或无子关系时返回 undefined。
   */
  private _createResolver(): AggregateResolver | undefined {
    const ds = this.host.tableDataSet
    if (!ds?.relations?.length) return undefined

    const relations = ds.getChildRelations(this.host.tableName, this.host.viewId)
    if (relations.length === 0) return undefined

    const relMap = new Map<string, DataRelation>()
    for (const r of relations) {
      const vid = r.childViewId ?? 'default'
      relMap.set(`${r.childTable}@${vid}`, r)
      if (!relMap.has(r.childTable)) relMap.set(r.childTable, r)
    }

    const pk = this.host.primaryKey
    const defaultParentField = typeof pk === 'string' ? pk : (pk[0] ?? 'id')

    return {
      resolveChildRows: (childRef: string, parentRow: IDataRow): IDataRow[] => {
        const rel = relMap.get(childRef)
        if (!rel) return []
        const parentField = rel.parentField ?? defaultParentField
        const parentValue = parentRow[parentField]
        if (parentValue === null || parentValue === undefined) return []
        const childView = ds.getView(rel.childTable, rel.childViewId ?? 'default')
        if (!childView) return []
        const childField = rel.childField
        if (!childField) return []
        return childView.rows.filter(r => r[childField] === parentValue)
      },
    }
  }
}


// ─────────────────────────────────────────────
// Host 接口
// ─────────────────────────────────────────────

/**
 * ComputedColumnDelegate 所需的宿主能力（ISP 最小子集）
 *
 * DataView 实现此接口，委托仅通过此接口访问宿主状态。
 */
export interface IComputedHost extends IViewIdentity {
  /** 主键字段名（用于聚合解析器的 parentField 缺省值） */
  readonly primaryKey: string | string[]
  /** 当前行数据（注册/上下文变更后立即求值） */
  readonly rows: IDataRow[]
  /**
   * DataTable 列定义（可空——DataTable 尚未 attach 时为 undefined）
   * @internal
   */
  readonly tableColumns: DataColumn[] | undefined
  /**
   * DataSet 引用（可空——DataTable 尚未 attach 或无 DataSet 时为 undefined）
   * 用于聚合解析器查找子视图关系。
   * @internal
   */
  readonly tableDataSet: IDataSet | undefined
}

// ─────────────────────────────────────────────
// ComputedColumnDelegate
// ─────────────────────────────────────────────

/**
 * 计算列委托
 *
 * 封装所有计算列逻辑，包括配置编译、编程式注册、子视图聚合、求值与剥离。
 * DataView 通过薄包装层对外暴露公开 API，本委托持有所有私有状态。
 */
export class ComputedColumnDelegate {

  private _columns = new Map<string, ComputedColumnFn>()
  private _context?: ComputedColumnContext

  constructor(private readonly host: IComputedHost) {}

  // ── 公开 API（由 DataView 薄包装转发）──────────────────

  /**
   * 设置共享上下文（表达式中通过 `ctx` 引用）。
   * 设置后重新编译所有配置驱动的计算列并对现有 rows 求值。
   */
  setContext(ctx: ComputedColumnContext): void {
    this._context = ctx
    this._syncFromConfig()     // ctx 变化，重建配置列闭包
    this._apply(this.host.rows)
  }

  /**
   * 注册计算列（函数式）。
   * 注册后对现有 rows 立即求值；后续数据变更自动重算。
   */
  setColumn(name: string, fn: ComputedColumnFn): void {
    this._columns.set(name, fn)
    this._apply(this.host.rows)
  }

  /**
   * 注册计算列（表达式字符串）。
   * 行字段直接引用，上下文通过 `ctx`，子视图聚合通过 `$sum` 等函数。
   */
  setExpression(name: string, expression: string): void {
    this._columns.set(name, compileExpression(expression, this._context, this._createResolver()))
    this._apply(this.host.rows)
  }

  /** 移除计算列定义（已求值的历史数据保留）。 */
  remove(name: string): void {
    this._columns.delete(name)
  }

  /**
   * 从 DataTable 列定义中提取 computeExpression 并编译注册（公开入口）。
   * 调用时机：DataTable 首次 attach 后（如需主动触发）。
   */
  initFromConfig(): void {
    this._syncFromConfig()
    this._apply(this.host.rows)
  }

  /** 已注册的计算列名集合（CrudDelegate 用于提交前剥离） */
  get names(): ReadonlySet<string> {
    return new Set(this._columns.keys())
  }

  /**
   * 对行集合执行所有计算列求值（就地写入）。
   * 无计算列时短路返回，零开销。
   */
  apply(rows: IDataRow[]): void {
    this._apply(rows)
  }

  /**
   * 从数据对象中移除计算列字段，返回浅拷贝。
   * 无计算列时直接返回原对象（零开销）。
   */
  strip(data: Partial<IDataRow>): Partial<IDataRow> {
    if (this._columns.size === 0) return data
    const cleaned = { ...data }
    for (const name of this._columns.keys()) {
      delete cleaned[name]
    }
    return cleaned
  }

  /**
   * DataTable setter 触发的同步编译（内部调用）。
   * DataTable attach 时 DataSet 可能尚未就绪（关系未建立），
   * 此时编译无聚合函数的列；DataSet 就绪后可通过 initFromConfig() 重新编译。
   */
  syncFromConfig(): void {
    this._syncFromConfig()
    // 注意：DataTable 刚 attach 时 rows 通常为空，跳过 apply 节省开销
    if (this.host.rows.length > 0) this._apply(this.host.rows)
  }

  /** 释放所有状态（DataView.destroy 时调用） */
  destroy(): void {
    this._columns.clear()
    this._context = undefined
  }

  // ── 私有实现 ──────────────────────────────────────────

  private _apply(rows: IDataRow[]): void {
    if (this._columns.size === 0 || rows.length === 0) return
    for (const row of rows) {
      for (const [name, fn] of this._columns) {
        try {
          row[name] = fn(row)
        } catch {
          row[name] = undefined
        }
      }
    }
  }

  private _syncFromConfig(): void {
    const columns = this.host.tableColumns
    if (!columns?.length) return
    const compiled = compileColumnsExpressions(columns, this._context, this._createResolver())
    for (const [name, fn] of compiled) {
      this._columns.set(name, fn)
    }
  }

  /**
   * 构建子视图聚合解析器。
   *
   * 基于 DataSet 的 relations，将当前视图作为父视图，按关系定义匹配子行。
   * 聚合函数参数格式：`'子表名'` 或 `'子表名@视图ID'`（双重索引）。
   *
   * @returns 解析器；无 DataSet 或无子关系时返回 undefined
   */
  private _createResolver(): AggregateResolver | undefined {
    const ds = this.host.tableDataSet
    if (!ds?.relations?.length) return undefined

    const relations = ds.getChildRelations(this.host.tableName, this.host.viewId)
    if (relations.length === 0) return undefined

    // 双重索引：精确键 "childTable@childViewId" + 短键 "childTable"（取第一匹配）
    const relMap = new Map<string, DataRelation>()
    for (const r of relations) {
      const vid = r.childViewId ?? 'default'
      relMap.set(`${r.childTable}@${vid}`, r)
      if (!relMap.has(r.childTable)) relMap.set(r.childTable, r)
    }

    const pk = this.host.primaryKey
    const defaultParentField = typeof pk === 'string' ? pk : (pk[0] ?? 'id')

    return {
      resolveChildRows: (childRef: string, parentRow: IDataRow): IDataRow[] => {
        const rel = relMap.get(childRef)
        if (!rel) return []

        const parentField = rel.parentField ?? defaultParentField
        const parentValue = parentRow[parentField]
        if (parentValue === null || parentValue === undefined) return []

        const childView = ds.getView(rel.childTable, rel.childViewId ?? 'default')
        if (!childView) return []

        const childField = rel.childField
        if (!childField) return []

        return childView.rows.filter(r => r[childField] === parentValue)
      },
    }
  }
}
