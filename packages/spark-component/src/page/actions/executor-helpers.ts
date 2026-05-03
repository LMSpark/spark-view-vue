/**
 * Action 执行器内部辅助：值解析 / 文案插值 / 行辅助
 *
 * 与具体 executor 解耦，专注通用工具。
 */

import type { DataView, IDataRow } from '@spark-view/spark-data'
import { resolveSelectedRowsPath } from '../../components/support/row-selection-path'
import type { ActionUiDecorator } from './action-descriptor'

// ── 值解析（轻量） ─────────────────────────────────────────────────────────

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

// ── 文案：插值 + 装饰回退 ────────────────────────────────────────────────

const INTERPOLATION = /\{(\w+(?:\.\w+)*)\}/g

/**
 * 模板插值：`{count}` `{row.name}` 等。
 * - vars 直接命中 → 用 vars 值
 * - vars 未命中且 row 存在 → 尝试 row[name] 或 row[a.b]
 * - 都没命中 → 保留原始 `{name}`
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number | undefined> = {},
  row: IDataRow | null = null,
): string {
  return template.replace(INTERPOLATION, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const v = vars[name]
      return v === undefined ? '' : String(v)
    }
    if (row) {
      const segments = name.split('.')
      let cur: unknown = row
      for (const seg of segments) {
        if (cur === null || cur === undefined || typeof cur !== 'object') { cur = undefined; break }
        cur = (cur as Record<string, unknown>)[seg]
      }
      if (cur !== undefined && cur !== null) return String(cur)
    }
    return `{${name}}`
  })
}

/**
 * 取装饰文案；若未配置则使用 fallback。
 * 显式 `''` 视为有意清空（返回空字符串，调用方据此跳过提示）。
 */
export function pickText(
  decorator: ActionUiDecorator | undefined,
  key: keyof ActionUiDecorator,
  fallback: string,
  vars?: Record<string, string | number | undefined>,
  row?: IDataRow | null,
): string {
  const raw = decorator?.[key]
  if (typeof raw !== 'string') return interpolate(fallback, vars, row ?? null)
  if (raw.length === 0) return ''
  return interpolate(raw, vars, row ?? null)
}

// ── 行辅助 ────────────────────────────────────────────────────────────────

export function isRowLike(value: unknown): value is IDataRow {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

export function resolveRowId(row: IDataRow, idField: string): string | number | null {
  const raw = row[idField]
  return typeof raw === 'string' || typeof raw === 'number' ? raw : null
}

export function inferNextRowId(view: DataView, idField: string): string | number {
  const numericIds = view.rows
    .map(row => row[idField])
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
  if (numericIds.length > 0) {
    return Math.max(...numericIds) + 1
  }
  const existing = new Set(
    view.rows
      .map(row => row[idField])
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  )
  const base = `row-${Date.now()}`
  if (!existing.has(base)) return base
  let index = 1
  let candidate = `${base}-${index}`
  while (existing.has(candidate)) {
    index += 1
    candidate = `${base}-${index}`
  }
  return candidate
}

const ROW_LABEL_CANDIDATES = ['orderNo', 'name', 'title']

export function resolveRowLabel(row: IDataRow, idField: string): string {
  for (const key of [...ROW_LABEL_CANDIDATES, idField]) {
    const value = row[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return '当前记录'
}

export function getSelectedRows(view: DataView): IDataRow[] {
  return resolveSelectedRowsPath(view)
}

export function hasRemoteListApi(view: DataView | null | undefined): boolean {
  return Boolean(view?.dataTable?.api?.list)
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  return ''
}
