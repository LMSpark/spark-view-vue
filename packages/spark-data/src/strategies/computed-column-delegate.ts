/**
 * ComputedColumnDelegate — 计算列委托
 *
 * 职责划分：
 * - **本文件**：表达式编译（`new Function` + `with` 沙箱）、聚合函数注入、
 *   已编译函数注册表（`ComputedColumnDelegate`）
 * - **DataView**：context 管理、聚合解析器构建（需要 tableName/viewId/DataSet 视角）、
 *   在 dataTable attach / context 变更时触发重编译
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
 * "$join('Tags', 'name', ' | ')"    // 字符串连接，第三参数为分隔符（默认 ', '）
 * ```
 */

import { Logger } from '@spark-view/spark-utils'
import type { IDataRow, ComputedColumnFn } from '../types'

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

// ─────────────────────────────────────────────
// 表达式编译器
// ─────────────────────────────────────────────

/** 检测表达式中是否含有聚合函数调用（子表引用类）*/
const AGG_PATTERN = /\$(?:sum|count|avg|min|max|list|join)\s*\(/

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
    const compiled = new Function('__row', 'ctx',
      `with(__row) { return (${expression}) }`,
    ) as (row: IDataRow, ctx: ComputedColumnContext | undefined) => unknown
    return (row: IDataRow) => compiled(row, frozenCtx)
  }

  // 聚合路径：注入 $sum/$count/$avg/$min/$max/$list/$join
  const compiled = new Function(
    '__row', '$sum', '$count', '$avg', '$min', '$max', '$list', '$join', 'ctx',
    `with(__row) { return (${expression}) }`,
  ) as (
    row: IDataRow,
    $sum: (t: string, f: string) => number,
    $count: (t: string) => number,
    $avg: (t: string, f: string) => number,
    $min: (t: string, f: string) => number | undefined,
    $max: (t: string, f: string) => number | undefined,
    $list: (t: string, f: string) => unknown[],
    $join: (t: string, f: string, sep?: string) => string,
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
  const $join  = (t: string, f: string, sep = ', '): string =>
    getChildRows(t).map(r => String(r[f] ?? '')).join(sep)

  return (row: IDataRow) => {
    _row = row
    _cache.clear()
    return compiled(row, $sum, $count, $avg, $min, $max, $list, $join, frozenCtx)
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
 * 计算列委托——编译函数注册表。
 *
 * 纯粹的函数 Map：存储已编译的 `ComputedColumnFn`，负责就地求值与 CRUD 剥离。
 * 不持有 DataTable / DataSet / context 引用——表达式编译和解析器构建由 DataView 负责。
 */
export class ComputedColumnDelegate {
  private _columns = new Map<string, ComputedColumnFn>()

  /** 注册计算列（已编译函数）。 */
  register(name: string, fn: ComputedColumnFn): void {
    this._columns.set(name, fn)
  }

  /** 移除计算列定义（已求值的历史数据保留）。 */
  remove(name: string): void {
    this._columns.delete(name)
  }

  /** 已注册的计算列名集合（CrudDelegate 用于提交前剥离）。 */
  get names(): ReadonlySet<string> {
    return new Set(this._columns.keys())
  }

  /** 对行集合就地写入所有计算列。无计算列时短路返回，零开销。 */
  apply(rows: IDataRow[]): void {
    if (this._columns.size === 0 || rows.length === 0) return
    for (const row of rows) {
      for (const [name, fn] of this._columns) {
        try { row[name] = fn(row) }
        catch { row[name] = undefined }
      }
    }
  }

  /** 剥离计算列字段，返回浅拷贝；无计算列时返回原对象（零开销）。 */
  strip(data: Partial<IDataRow>): Partial<IDataRow> {
    if (this._columns.size === 0) return data
    const cleaned = { ...data }
    for (const name of this._columns.keys()) delete cleaned[name]
    return cleaned
  }

  /** 清空所有状态（DataView.destroy 时调用）。 */
  destroy(): void {
    this._columns.clear()
  }
}
