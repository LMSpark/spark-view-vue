/**
 * ActionDescriptor 语义禁用判断 — SSoT
 *
 * 所有内置动作的禁用逻辑统一在此处，以 ActionDescriptor 为入参，
 * 不再依赖原始 SparkNode 或 propsMap。
 */

import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { ActionDescriptor, ActionExecutionScope } from './action-descriptor'
import { getSelectedRows } from './executor-helpers'

// ── 私有辅助 ──────────────────────────────────────────────────────────────

function normalizeComparable(value: unknown): unknown {
  if (value === '') return null
  return value ?? null
}

function matchesRowCondition(
  row: IDataRow | null | undefined,
  condition: Record<string, unknown>,
): boolean {
  if (!row) return false
  for (const [field, expected] of Object.entries(condition)) {
    if (normalizeComparable(row[field]) !== normalizeComparable(expected)) return false
  }
  return true
}

// ── 禁用判断 SSoT ─────────────────────────────────────────────────────────

/**
 * 根据 descriptor 动作语义 + DataView 当前状态 + 执行作用域判断按钮是否禁用。
 *
 * 调用方需在调用前处理 `disabled` 静态 prop（不在此函数范围内）。
 */
export function isActionDescriptorDisabled(
  descriptor: ActionDescriptor,
  view: DataView | null | undefined,
  scope?: ActionExecutionScope,
): boolean {
  if (!view) return false

  // disabledWhenRow：检查目标行字段值是否匹配条件（data-mutating 动作共有的 UI 装饰）
  const uiDesc = descriptor as Partial<{ disabledWhenRow: Record<string, unknown> }>
  if (uiDesc.disabledWhenRow) {
    const checkRow = scope?.row ?? view.currentRow ?? null
    if (matchesRowCondition(checkRow, uiDesc.disabledWhenRow)) return true
  }

  switch (descriptor.action) {
    // 这些动作永不因结构状态而禁用
    case 'show-message':
    case 'confirm':
    case 'alert':
    case 'navigate':
    case 'open':
    case 'set-field':
    case 'append-row':
    case 'refresh':
      return false

    case 'clear-rows':
      return view.rows.length === 0

    case 'submit-current-form':
      return view.currentRow === null

    case 'delete':
    case 'patch':
    case 'message-row': {
      const { target } = descriptor
      if (target === 'scope') return scope?.row === undefined
      if (target === 'current') return view.currentRow === null
      // 'selected'
      return getSelectedRows(view).length === 0
    }

    case 'move': {
      const { target } = descriptor
      if (target === 'scope') return scope?.row === undefined
      // 'current'
      return view.currentRow === null
    }

    default:
      return false
  }
}
