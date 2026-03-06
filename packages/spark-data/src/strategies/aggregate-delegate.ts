/**
 * AggregateDelegate — 视图级聚合委托
 *
 * 持有 summaryRow（全部行聚合）和 selectionSummaryRow（选中行聚合）的缓存状态，
 * 并在行数据或选中行变更时完成重算与事件通知。
 *
 * `computeAggregateRow` 纯函数也在此文件定义（原位于 computed-column-delegate.ts）。
 */

import type { IDataRow, AggregateColumnConfig, AggregateType } from '../types'

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
        default: break
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
        default: break
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
      default: break
    }
  }

  return result
}

// ─────────────────────────────────────────────
// AggregateDelegate
// ─────────────────────────────────────────────

/**
 * 视图级聚合委托——持有并管理 summaryRow / selectionSummaryRow 缓存状态。
 *
 * - `recompute(rows, selectedRows)` — 行数据变更时全量重算（含选中行），发射 summaryChanged
 * - `recomputeSelection(selectedRows)` — 仅选中行变更时局部重算，发射 selectionSummaryChanged
 */
export class AggregateDelegate {
  private _summaryRow: IDataRow = {}
  private _selectionSummaryRow: IDataRow = {}

  constructor(
    /** 返回当前视图聚合配置（每次调用时读取，支持运行时动态配置） */
    private readonly getAggregates: () => Record<string, AggregateColumnConfig>,
    /** 通知订阅方全部聚合行已更新（summaryRow + selectionSummaryRow） */
    private readonly emitSummaryChanged: () => void,
    /** 通知订阅方仅选中行聚合已更新（selectionSummaryRow） */
    private readonly emitSelectionSummaryChanged: () => void,
  ) {}

  get summaryRow(): Readonly<IDataRow> { return this._summaryRow }
  get selectionSummaryRow(): Readonly<IDataRow> { return this._selectionSummaryRow }

  /**
   * 全量重算（行数据变更时调用，必须在 `_applyComputedColumns` 之后）。
   *
   * @param rows         全部行（已含计算列求值结果）
   * @param selectedRows 当前选中行（无选中时传空数组）
   */
  recompute(rows: IDataRow[], selectedRows: IDataRow[]): void {
    const aggs = this.getAggregates()
    if (Object.keys(aggs).length === 0) return
    this._summaryRow = computeAggregateRow(aggs, rows)
    this._selectionSummaryRow = selectedRows.length > 0
      ? computeAggregateRow(aggs, selectedRows)
      : {}
    this.emitSummaryChanged()
  }

  /**
   * 仅重算选中行聚合（选中行变更时调用，行数据本身未变）。
   *
   * @param selectedRows 当前选中行
   */
  recomputeSelection(selectedRows: IDataRow[]): void {
    const aggs = this.getAggregates()
    if (Object.keys(aggs).length === 0) return
    this._selectionSummaryRow = selectedRows.length > 0
      ? computeAggregateRow(aggs, selectedRows)
      : {}
    this.emitSelectionSummaryChanged()
  }
}
