/**
 * ComputedColumnDelegate — 计算列管理器
 *
 * 职责：
 * - 表达式编译（`new Function` + `with` 沙箱）、子表聚合函数注入
 * - 已编译函数注册表（`ComputedColumnDelegate`）
 * - 编译缓存管理（列指纹 + ctx 变更检测）
 * - 聚合解析器构建（通过 Host 接口访问 DataSet/DataRelation）
 * - 列级聚合行计算（`computeAggregateRow` 纯函数）
 *
 * DataView 仅保留薄代理（setComputedContext / recomputeColumns / summaryRow getter），
 * 所有编排逻辑委托到本文件。
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

import { Logger, toErrorMessage } from '@spark-view/spark-utils'
import type { IDataRow, ComputedColumnFn, AggregateColumnConfig, AggregateType, DataRelation } from '../types'

const logger = Logger('DataView:Computed')

// ─────────────────────────────────────────────
// 类型 & 接口
// ─────────────────────────────────────────────

/** 表达式求值时可传入的外部上下文（在表达式中以 `ctx` 变量引用） */
export type ComputedColumnContext = Record<string, unknown>

/**
 * 聚合解析器——提供子表行解析（$sum/$count/$avg/$min/$max/$list/$join）。
 *
 * 视图引用格式：`'表名'` 或 `'表名@视图ID'`
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

/** 拦截原型链访问的危险属性，防止 `with(__row)` 沙箱逃逸 */
const BLOCKED_KEYS = new Set<string | symbol>([
  '__proto__', 'constructor', 'prototype',
  'globalThis', 'window', 'self', 'eval', 'Function',
  'process', 'require', 'module',
])

/**
 * 创建安全代理——拦截 `with(__row)` 中对原型链/全局环境的访问。
 * has 仅对 BLOCKED_KEYS 和已有属性返回 true，安全内置对象（Math/Number 等）可正常回退到全局。
 */
function createSafeRowProxy(row: IDataRow): IDataRow {
  return new Proxy(row, {
    has(t, key) {
      if (typeof key === 'string' && BLOCKED_KEYS.has(key)) return true
      return Reflect.has(t, key)
    },
    get(t, key) {
      if (key === Symbol.unscopables) return undefined
      if (typeof key === 'string' && BLOCKED_KEYS.has(key)) return undefined
      return Reflect.get(t, key)
    },
  })
}

/** 检测表达式中是否含有子表聚合函数调用 */
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
  getColumns(): ReadonlyArray<{ name: string; computeExpression?: string }> | undefined
  /** 获取 DataSet 实例（可能为 undefined——无 DataSet 上下文） */
  getDataSet(): IComputedColumnDataSet | undefined
}

/**
 * Delegate 所需的 DataSet 最小接口——避免导入完整 DataSet 类型。
 */
export interface IComputedColumnDataSet {
  readonly relations: DataRelation[] | undefined
  getChildRelations(parentTable: string, parentViewId: string): DataRelation[]
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
 * - 编译缓存（列指纹 + ctx 变更检测）
 * - 聚合解析器构建（DataRelation → 子行解析）
 */
export class ComputedColumnDelegate {
  private _columns = new Map<string, ComputedColumnFn>()
  private _namesCache: ReadonlySet<string> | undefined
  private _host: IComputedColumnHost
  private _compileCacheKey: string | undefined
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
    this._compileCacheKey = undefined
    this.syncFromConfig()
  }

  /** 获取当前上下文（只读）。 */
  get context(): ComputedColumnContext {
    return this._ctx
  }

  /** @internal 失效编译缓存，下次 syncFromConfig 将强制重编译。 */
  invalidateCache(): void {
    this._compileCacheKey = undefined
  }

  /**
   * 从宿主的 DataTable 列定义编译并注册计算列。
   * 内置编译缓存：列指纹 + ctx 不变时跳过。
   */
  syncFromConfig(): void {
    const columns = this._host.getColumns()
    if (!columns?.length) return

    // 编译缓存：列表达式指纹 + ctx 对象引用
    const exprFingerprint = columns
      .filter(c => c.computeExpression)
      .map(c => `${c.name}:${c.computeExpression}`)
      .join('|')
    const cacheKey = `${exprFingerprint}@@${this._ctx ? JSON.stringify(this._ctx) : ''}`
    if (cacheKey === this._compileCacheKey) return   // 缓存命中，跳过编译
    this._compileCacheKey = cacheKey

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
    const cleaned = { ...data }
    for (const name of this._columns.keys()) delete cleaned[name]
    return cleaned
  }

  /** 清空所有状态（DataView.destroy 时调用）。 */
  destroy(): void {
    this._columns.clear()
    this._namesCache = undefined
    this._ctx = {}
    this._compileCacheKey = undefined
  }

  // ── 内部：聚合解析器 ─────────────────────────

  /**
   * 构建聚合解析器——子表行解析。
   */
  private _createAggregateResolver(): AggregateResolver | undefined {
    const ds = this._host.getDataSet()
    if (!ds) return undefined

    const relations = ds.relations?.length
      ? ds.getChildRelations(this._host.tableName, this._host.viewId)
      : []

    // 双重索引：精确键 "childTable@childViewId" + 短键 "childTable"（取第一匹配）
    const relMap = new Map<string, DataRelation>()
    for (const r of relations) {
      const vid = r.childViewId ?? 'default'
      relMap.set(`${r.childTable}@${vid}`, r)
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
// 聚合行计算（纯函数）
// ─────────────────────────────────────────────

/**
 * 根据视图级聚合配置（`view.aggregates`）计算汇总行。
 *
 * **纯函数**——无副作用，不依赖 DataView/DataSet 实例，方便独立测试。
 *
 * @param aggregates 聚合配置：`{ outputName: AggregateColumnConfig }`
 * @param rows       参与聚合的行集合
 * @returns 汇总行对象；aggregates 为空或无行数据时返回空对象
 */
export function computeAggregateRow(
  aggregates: Record<string, AggregateColumnConfig>,
  rows: readonly IDataRow[],
): IDataRow {
  const aggCols = Object.entries(aggregates)
  if (aggCols.length === 0) return {}

  // 空行时提前返回每种聚合类型的默认零值
  if (rows.length === 0) {
    const result: IDataRow = {}
    for (const [name, config] of aggCols) {
      switch (config.type) {
        case 'sum':   result[name] = 0; break
        case 'count': result[name] = 0; break
        case 'avg':   result[name] = 0; break
        case 'min':   result[name] = undefined; break
        case 'max':   result[name] = undefined; break
        case 'join':  result[name] = ''; break
      }
    }
    return result
  }

  // ── 单遍扫描：一次遍历 rows 更新所有聚合列的累加器 ──
  type Acc = { type: AggregateType; field: string; name: string; count: number; sum: number; extremum: number; separator: string; segments: string[] }
  const accs: Acc[] = aggCols.map(([name, config]) => ({
    type: config.type, field: config.field ?? name, name,
    count: 0,       // count / avg 非空计数
    sum: 0,         // sum / avg 累加
    extremum: config.type === 'min' ? Infinity : config.type === 'max' ? -Infinity : 0,
    separator: config.separator ?? ', ',
    segments: [],
  }))

  for (const row of rows) {
    for (const a of accs) {
      const raw = row[a.field]
      switch (a.type) {
        case 'sum':   a.sum += Number(raw ?? 0); break
        case 'count': if (raw !== null && raw !== undefined) a.count++; break
        case 'avg': {
          const v = Number(raw ?? NaN)
          if (!isNaN(v)) { a.sum += v; a.count++ }
          break
        }
        case 'min': { const v = Number(raw); if (!isNaN(v) && v < a.extremum) a.extremum = v; break }
        case 'max': { const v = Number(raw); if (!isNaN(v) && v > a.extremum) a.extremum = v; break }
        case 'join':  if (raw !== null && raw !== undefined && raw !== '') a.segments.push(String(raw)); break
      }
    }
  }

  const result: IDataRow = {}
  for (const a of accs) {
    switch (a.type) {
      case 'sum':   result[a.name] = a.sum; break
      case 'count': result[a.name] = a.count; break
      case 'avg':   result[a.name] = a.count > 0 ? a.sum / a.count : 0; break
      case 'min':   result[a.name] = a.extremum === Infinity ? undefined : a.extremum; break
      case 'max':   result[a.name] = a.extremum === -Infinity ? undefined : a.extremum; break
      case 'join':  result[a.name] = a.segments.join(a.separator); break
    }
  }

  return result
}
