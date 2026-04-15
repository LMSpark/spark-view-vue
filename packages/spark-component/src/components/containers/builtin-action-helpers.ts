/**
 * 内置声明式动作系统 — 纯函数工具集
 *
 * 值解析、类型守卫、行数据辅助等无状态纯函数，
 * 供 meta / disabled / handler 三个模块共用。
 */

import type { PageMessageType } from '@spark-view/spark-utils'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../internal'

// ── 值解析 ────────────────────────────────────────────────────────────────

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function readMessageType(value: unknown): PageMessageType {
  const text = readString(value)
  if (!text) return 'info'

  switch (text) {
    case 'success':
    case 'error':
    case 'warning':
    case 'info':
      return text
    default:
      return 'info'
  }
}

export function getActionProps(action: SparkNode): Record<string, unknown> {
  return asRecord(action.props) ?? {}
}

export function hasOwnProp(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

export function resolveConfiguredText(record: Record<string, unknown>, key: string, fallback: string): string {
  if (!hasOwnProp(record, key)) return fallback
  const raw = record[key]
  if (typeof raw === 'string') return raw.trim()
  return ''
}

export function normalizeComparable(value: unknown): unknown {
  if (value === '') return null
  return value ?? null
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }
  return ''
}

// ── 行数据辅助 ────────────────────────────────────────────────────────────

export function getSelectedRows(view: DataView): IDataRow[] {
  return Array.isArray(view.selectedRows) ? view.selectedRows : []
}

export function resolveEditTargetRow(
  view: DataView,
  scope: { row?: IDataRow } | undefined,
  propsMap: Record<string, unknown>,
): IDataRow | null {
  const targetRow = readString(propsMap['targetRow'])
  if (targetRow === 'current') {
    return view.currentRow
  }
  if (targetRow === 'scope') {
    return scope?.row ?? null
  }
  return scope?.row ?? view.currentRow ?? null
}
