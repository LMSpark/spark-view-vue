/**
 * 内置声明式动作系统 — 纯函数工具集
 *
 * 值解析、类型守卫、行数据辅助等无状态纯函数，
 * 供 meta / disabled / handler 三个模块共用。
 */

import type { PageMessageType } from '../../components/internal'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../../components/internal'
import { nodeInputProps } from '../../components/internal'
import { resolveSelectedRowsPath } from '../../components/support/row-selection-path'

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
  return nodeInputProps(action)
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

const MESSAGE_TEXT_KEYS = ['confirmMessage', 'confirmTitle', 'successMessage', 'failureMessage', 'emptyMessage', 'errorMessage', 'validateMessage'] as const

export function interpolateMessageProps(
  record: Record<string, unknown>,
  vars: Record<string, string | number>,
): Record<string, unknown> {
  let touched = false
  const next: Record<string, unknown> = { ...record }
  for (const key of MESSAGE_TEXT_KEYS) {
    const raw = next[key]
    if (typeof raw !== 'string') continue
    const replaced = raw.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const v = vars[name]
      return v === undefined ? `{${name}}` : String(v)
    })
    if (replaced !== raw) {
      next[key] = replaced
      touched = true
    }
  }
  return touched ? next : record
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
  return resolveSelectedRowsPath(view)
}

export function hasRemoteListApi(view: DataView | null | undefined): boolean {
  return Boolean(view?.dataTable?.api?.list)
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
