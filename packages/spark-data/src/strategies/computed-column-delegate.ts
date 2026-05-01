/**
 * ComputedColumnDelegate — 计算列管理器
 *
 * 职责：
 * - 表达式编译（`new Function` + `with` 沙箱）、子表聚合函数注入
 * - 已编译函数注册表（`ComputedColumnDelegate`）
 * - 编译缓存管理（列指纹 + ctx 变更检测）
 * - 聚合解析器构建（通过 Host 接口访问 DataSet/DataRelation）
 *
 * DataView 仅保留薄代理（setComputedContext / recomputeColumns / aggregateResult getter），
 * 所有编排逻辑委托到本文件。
 *
 * ## 表达式格式
 * ```
 * "price * qty"
 * "firstName + ' ' + lastName"
 * "ctx.taxRate ? amount * ctx.taxRate : amount"
 *
 * // 子表聚合（需配置 DataRelation；第一个参数按 childTable 匹配，当前读取 default 视图）
 * "$sum('OrderItems', 'amount')"
 * "$count('OrderItems')"
 * "$avg('Scores', 'score')"
 * "$min('Bids', 'price')"
 * "$max('Bids', 'price')"
 * "$list('Tags', 'name').join(', ')"
 * "$join('Tags', 'name', ' | ')"    // 字符串连接，第三参数为分隔符（默认 ', '）
 * ```
 */

import { Logger, toErrorMessage, createSafeProxy } from '@spark-view/spark-utils'
import type { IDataRow, ComputedColumnFn, TableRelation } from '../types'

const logger = Logger('DataView:Computed')

// ─────────────────────────────────────────────
// 类型 & 接口
// ─────────────────────────────────────────────

/** 表达式求值时可传入的外部上下文（在表达式中以 `ctx` 变量引用） */
export type ComputedColumnContext = Record<string, unknown>

/**
 * 聚合解析器——提供子表行解析（$sum/$count/$avg/$min/$max/$list/$join）。
 *
 * 子表引用格式：`'子表名'`。当前 resolver 按 TableRelation.childTable 匹配并读取 default 视图。
 */
export interface AggregateResolver {
  /** 解析子表匹配行（$sum/$count/$avg/$min/$max/$list/$join） */
  resolveChildRows(childRef: string, parentRow: IDataRow): IDataRow[]
}

// ─────────────────────────────────────────────
// 表达式编译器
// ─────────────────────────────────────────────

/** 表达式最大长度限制（防止超长代码注入） */
const MAX_EXPRESSION_LENGTH = 2048

/** 行数据安全代理（复用 spark-utils 共享沙箱策略） */
const createSafeRowProxy = (row: IDataRow): IDataRow => createSafeProxy(row)

/** 检测表达式中是否含有子表聚合函数调用 */
const AGG_PATTERN = /\$(?:sum|count|avg|min|max|list|join)\s*\(/

/**
 * 将表达式字符串编译为 ComputedColumnFn。
 *
 * - 行字段直接引用（`with(__row)` 解构），无需前缀
 * - 外部上下文通过 `ctx` 参数
 * - 子表聚合通过 `$sum` 等注入函数（需提供 `resolver`）
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
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`表达式超长（${expression.length} > ${MAX_EXPRESSION_LENGTH}），已拒绝编译`)
  }
  const _ctx = ctx ?? {}
  const hasAgg = resolver !== undefined && AGG_PATTERN.test(expression)

  // 判断表达式是否为多语句函数体（包含 return 关键字）
  const isBlock = /\breturn\b/.test(expression)
  const body = isBlock
    ? `with(__row) { ${expression} }`
    : `with(__row) { return (${expression}) }`

  if (!hasAgg) {
    // 快速路径：无聚合函数
    const compiled = new Function('__row', 'ctx', body,
    ) as (row: IDataRow, ctx: ComputedColumnContext) => unknown
    return (row: IDataRow) => compiled(createSafeRowProxy(row), _ctx)
  }

  // 聚合路径：注入 $sum/$count/$avg/$min/$max/$list/$join
  const compiled = new Function(
    '__row', '$sum', '$count', '$avg', '$min', '$max', '$list', '$join', 'ctx',
    body,
  ) as (
    row: IDataRow,
    $sum: (t: string, f: string) => number,
    $count: (t: string) => number,
    $avg: (t: string, f: string) => number,
    $min: (t: string, f: string) => number | undefined,
    $max: (t: string, f: string) => number | undefined,
    $list: (t: string, f: string) => unknown[],
    $join: (t: string, f: string, sep?: string) => string,
    ctx: ComputedColumnContext,
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
    if (rows.length === 0) return undefined
    let result = Infinity
    for (const r of rows) { const v = Number(r[f]); if (v < result) result = v }
    return result
  }
  const $max   = (t: string, f: string): number | undefined => {
    const rows = getChildRows(t)
    if (rows.length === 0) return undefined
    let result = -Infinity
    for (const r of rows) { const v = Number(r[f]); if (v > result) result = v }
    return result
  }
  const $list  = (t: string, f: string): unknown[] => getChildRows(t).map(r => r[f])
  const $join  = (t: string, f: string, sep = ', '): string =>
    getChildRows(t).map(r => String(r[f] ?? '')).join(sep)

  return (row: IDataRow) => {
    _row = row
    _cache.clear()
    return compiled(createSafeRowProxy(row), $sum, $count, $avg, $min, $max, $list, $join, _ctx)
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
      logger.warn(`计算列 "${col.name}" 表达式编译失败: ${toErrorMessage(error)}`)
    }
  }
  return result
}

// ─────────────────────────────────────────────
// Host 接口（ISP 最小子集）
// ─────────────────────────────────────────────

/**
 * ComputedColumnDelegate 所需的宿主能力。
 *
 * DataView 实现此接口，delegate 仅通过此接口访问宿主状态。
 * 遵循 ISP：只暴露计算列编排所需的最小属性集。
 */
export interface IComputedColumnHost {
  readonly tableName: string
  readonly viewId: string
  readonly primaryKey: string
  /** 宿主的行数据 */
  readonly rows: IDataRow[]
  /** DataTable 列定义（可能为 undefined——dataTable 尚未 attach） */
  readonly columns: ReadonlyArray<{ name: string; computeExpression?: string }> | undefined
  /** 获取 DataSet 实例（可能为 undefined——无 DataSet 上下文） */
  getDataSet(): IComputedColumnDataSet | undefined
}

/**
 * Delegate 所需的 DataSet 最小接口——避免导入完整 DataSet 类型。
 */
export interface IComputedColumnDataSet {
  readonly tableRelations: TableRelation[] | undefined
  getTableChildRelations(parentTable: string): TableRelation[]
  getView(tableName: string, viewId?: string): { readonly rows: IDataRow[] } | undefined
}

// ─────────────────────────────────────────────
// ComputedColumnDelegate
// ─────────────────────────────────────────────

/**
 * 计算列管理器——编译、求值、缓存的统一委托。
 *
 * 通过 IComputedColumnHost 访问 DataView 状态，自身管理：
 * - 已编译函数注册表（Map<name, fn>）
 * - 编译缓存（列指纹字符串 + ctx 对象引用，=== 比较，零序列化开销）
 * - 聚合解析器构建（DataRelation → 子行解析）
 */
export class ComputedColumnDelegate {
  private _columns = new Map<string, ComputedColumnFn>()
  private _namesCache: ReadonlySet<string> | undefined
  private _host: IComputedColumnHost
  /** 上次编译时的列表达式指纹（用于检测列定义变更） */
  private _compiledExprKey: string | undefined
  /** 上次编译时传入的 ctx 对象引用（用于检测 ctx 切换，不做深比较） */
  private _compiledCtxRef: ComputedColumnContext | undefined
  private _ctx: ComputedColumnContext = {}

  constructor(host: IComputedColumnHost) {
    this._host = host
  }

  // ── 公共 API ─────────────────────────────────

  /** 已注册的计算列名集合（CrudDelegate 用于提交前剥离）。缓存，变更时失效。 */
  get names(): ReadonlySet<string> {
    return (this._namesCache ??= new Set(this._columns.keys()))
  }

  /** 设置计算列共享上下文，失效缓存并触发重编译。 */
  setContext(ctx: ComputedColumnContext): void {
    this._ctx = ctx
    this._compiledExprKey = undefined
    this._compiledCtxRef = undefined
    this.syncFromConfig()
  }

  /** 获取当前上下文（只读）。 */
  get context(): ComputedColumnContext {
    return this._ctx
  }

  /** @internal 失效编译缓存，下次 syncFromConfig 将强制重编译。 */
  invalidateCache(): void {
    this._compiledExprKey = undefined
    this._compiledCtxRef = undefined
  }

  /**
   * 从宿主的 DataTable 列定义编译并注册计算列。
   * 内置编译缓存：列指纹 + ctx 不变时跳过。
   */
  syncFromConfig(): void {
    const columns = this._host.columns
    if (!columns?.length) return

    // 编译缓存：列表达式指纹（字符串比较）+ ctx 对象引用（=== 比较，不做深序列化）
    // 单次遍历构建指纹，避免 filter+map+join 分配临时数组
    let exprFingerprint = ''
    for (const c of columns) {
      if (c.computeExpression) {
        if (exprFingerprint) exprFingerprint += '|'
        exprFingerprint += `${c.name}:${c.computeExpression}`
      }
    }
    if (exprFingerprint === this._compiledExprKey && this._ctx === this._compiledCtxRef) return   // 缓存命中，跳过编译
    this._compiledExprKey = exprFingerprint
    this._compiledCtxRef = this._ctx

    const compiled = compileColumnsExpressions(
      columns as Array<{ name: string; computeExpression?: string }>,
      this._ctx,
      this._createAggregateResolver(),
    )
    for (const [name, fn] of compiled) this._columns.set(name, fn)
    this._namesCache = undefined
  }

  /** 注册计算列（已编译函数）。 */
  register(name: string, fn: ComputedColumnFn): void {
    this._columns.set(name, fn)
    this._namesCache = undefined
  }

  /** 移除计算列定义（已求值的历史数据保留）。 */
  remove(name: string): void {
    this._columns.delete(name)
    this._namesCache = undefined
  }

  /** 对行集合就地写入所有计算列。无计算列时短路返回，零开销。 */
  apply(rows: IDataRow[]): void {
    if (this._columns.size === 0 || rows.length === 0) return
    for (const row of rows) {
      for (const [name, fn] of this._columns) {
        try { row[name] = fn(row) }
        catch (e) {
          row[name] = undefined
          if (import.meta.env.DEV) {
            logger.debug(`计算列 "${name}" 求值失败: ${toErrorMessage(e)}`)
          }
        }
      }
    }
  }

  /** 剥离计算列字段，返回浅拷贝；无计算列时返回原对象（零开销）。 */
  strip(data: Partial<IDataRow>): Partial<IDataRow> {
    if (this._columns.size === 0) return data
    return Object.fromEntries(
      Object.entries(data).filter(([key]) => !this._columns.has(key))
    ) as Partial<IDataRow>
  }

  /** 清空所有状态（DataView.destroy 时调用）。 */
  destroy(): void {
    this._columns.clear()
    this._namesCache = undefined
    this._ctx = {}
    this._compiledExprKey = undefined
    this._compiledCtxRef = undefined
  }

  // ── 内部：聚合解析器 ─────────────────────────

  /**
   * 构建聚合解析器——子表行解析。
   */
  private _createAggregateResolver(): AggregateResolver | undefined {
    const ds = this._host.getDataSet()
    if (!ds) return undefined

    const tableRelations = ds.tableRelations?.length
      ? ds.getTableChildRelations(this._host.tableName)
      : []

    // 双重索引：短键 "childTable"（取第一匹配）
    const relMap = new Map<string, TableRelation>()
    for (const r of tableRelations) {
      if (!relMap.has(r.childTable)) relMap.set(r.childTable, r)
    }

    const defaultParentField = this._host.primaryKey

    return {
      resolveChildRows: (childRef: string, parentRow: IDataRow): IDataRow[] => {
        const rel = relMap.get(childRef)
        if (!rel) return []
        const parentField = rel.parentField ?? defaultParentField
        const parentValue = parentRow[parentField]
        if (parentValue === null || parentValue === undefined) return []
        const childView = ds.getView(rel.childTable, 'default')
        if (!childView) return []
        const childField = rel.childField
        if (!childField) return []
        return childView.rows.filter(r => r[childField] === parentValue)
      },
    }
  }
}
