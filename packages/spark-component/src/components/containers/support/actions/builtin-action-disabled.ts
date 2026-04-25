/**
 * 内置声明式动作系统 — 禁用逻辑
 *
 * 根据动作类型、DataView 状态和作用域判断动作是否禁用。
 */

import type { DataView, IDataRow, IDataSource } from '@spark-view/spark-data'
import type { SparkNode } from '../../../internal'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../../support/beforeRender.js'
import { extractModelPermission } from '../../../../permission/index.js'
import { getBuiltinActionName } from '../../../../page/actions/index.js'
import type { BuiltinActionScope } from './builtin-action-types'
import {
  getActionProps,
  readBoolean,
  asRecord,
  normalizeComparable,
  getSelectedRows,
  resolveEditTargetRow,
} from './builtin-action-helpers'

// ── 私有辅助 ──────────────────────────────────────────────────────────────

function resolveBuiltinBeforeRenderAction(
  action: SparkNode,
  view: DataView | null | undefined,
  scope?: BuiltinActionScope,
): SparkNode {
  const currentRow = scope?.row ?? view?.currentRow ?? null
  const dataSource = (view ?? null) as IDataSource | null
  const state = resolveNodeBeforeRender(action, {
    row: currentRow,
    data: currentRow,
    index: scope?.index,
    dataSource,
    modelPermission: extractModelPermission(dataSource),
    host: {
      type: null,
    },
  }, (message, error) => {
    if (!import.meta.env.DEV) return
    console.warn(`[builtin-actions] ${message}`, error)
  })

  return mergeNodeBeforeRenderProps(action, state.propsPatch, {
    mirrorDisabledToButtonDisabled: true,
  })
}

function matchesRowCondition(row: IDataRow | null | undefined, condition: Record<string, unknown> | null): boolean {
  if (!row || !condition) return false
  for (const [field, expected] of Object.entries(condition)) {
    if (normalizeComparable(row[field]) !== normalizeComparable(expected)) {
      return false
    }
  }
  return true
}

function resolveBuiltinTargetRow(view: DataView, scope: BuiltinActionScope | undefined): IDataRow | null {
  return scope?.row ?? view.currentRow ?? null
}

// ── 禁用判断 ──────────────────────────────────────────────────────────────

export function isBuiltinActionDisabled(
  action: SparkNode,
  view: DataView | null | undefined,
  scope?: BuiltinActionScope,
): boolean {
  const resolvedAction = resolveBuiltinBeforeRenderAction(action, view, scope)
  const propsMap = getActionProps(resolvedAction)
  if (readBoolean(propsMap['buttonDisabled']) === true || readBoolean(propsMap['disabled']) === true) return true

  const actionName = getBuiltinActionName(resolvedAction)
  if (!actionName || !view) return false

  const disabledWhenRow = asRecord(propsMap['disabledWhenRow'])
  if (matchesRowCondition(resolveBuiltinTargetRow(view, scope), disabledWhenRow)) {
    return true
  }

  switch (actionName) {
    case 'append-row':
    case 'prompt-append':
    case 'refresh':
      return false
    case 'clear-rows':
      return view.rows.length === 0
    case 'submit-current-form':
      return view.currentRow === null
    case 'move-row':
      return scope?.row === undefined
    case 'delete-row':
    case 'patch-row':
    case 'message-row':
      return scope?.row === undefined
    case 'delete-current':
    case 'patch-current':
    case 'message-current':
    case 'move-current':
      return view.currentRow === null
    case 'prompt-edit':
      return resolveEditTargetRow(view, scope, propsMap) === null
    case 'delete-selected':
    case 'patch-selected':
      return getSelectedRows(view).length === 0
    default:
      return false
  }
}
