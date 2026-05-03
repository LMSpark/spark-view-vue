/**
 * Action 执行器内部辅助：值解析 / 文案插值 / 行辅助 / 消息通知 / 数据能力解析 / 内置动作 props 工具
 */

import type { DataView, IDataRow } from '@spark-view/spark-data'
import { getViewFromRawKey, resolveDataKeyBinding } from '@spark-view/spark-data'
import type { PageMessageType } from '../../components/internal'
import type { SparkNode } from '../../components/internal'
import { nodeInputProps } from '../../components/internal'
import type { ActionDescriptor, ActionExecutionContext, ActionExecutionScope, ActionUiDecorator } from './action-types'
import { Logger } from '@spark-view/spark-utils'

const _notifierLogger = Logger('action-executor')

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
  return view.selectedRows.slice()
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  return ''
}

// ── 内置动作 props 工具 ──────────────────────────────────────────────────────────────

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filtered = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return filtered.length > 0 ? filtered : undefined
}

export function readOptionalMessageType(value: unknown): PageMessageType | undefined {
  const text = readString(value)
  if (!text) return undefined

  switch (text) {
    case 'success':
    case 'error':
    case 'warning':
    case 'info':
      return text
    default:
      return undefined
  }
}

export function getActionProps(action: SparkNode): Record<string, unknown> {
  return nodeInputProps(action)
}

// ── 消息通知器 ────────────────────────────────────────────────────────────

export interface ActionNotifier {
  /** 发送装饰文案；silent 则吞掉 */
  notify(type: PageMessageType, message: string): void
  /** 发送 error（无视 silent） */
  notifyError(message: string): void
}

export function createActionNotifier(
  ctx: ActionExecutionContext,
  decorator: ActionUiDecorator | undefined,
): ActionNotifier {
  const silent = decorator?.silent === true

  function send(type: PageMessageType, message: string): void {
    if (message.trim().length === 0) return
    const ps = ctx.getPageService()
    if (ps) {
      ps.showMessage(message, type)
      return
    }
    if (import.meta.env.DEV) {
      _notifierLogger.warn(`PAGE_SERVICE 不可用，消息未展示: ${message}`)
    }
  }

  return {
    notify(type, message) {
      if (silent) return
      send(type, message)
    },
    notifyError(message) {
      send('error', message)
    },
  }
}

/**
 * 统一确认：返回 true 表示通过（无 confirmMessage 也直通）。
 */
export async function confirmIfNeeded(
  ctx: ActionExecutionContext,
  decorator: ActionUiDecorator | undefined,
  fallbackMessage: string,
  fallbackTitle: string,
): Promise<boolean> {
  const ps = ctx.getPageService()
  if (!ps) return true

  const rawMessage = decorator?.confirmMessage
  if (rawMessage === '') return true
  const message = rawMessage ?? fallbackMessage
  if (message.trim().length === 0) return true

  const title = decorator?.confirmTitle ?? fallbackTitle
  const opts: { type?: PageMessageType } = {}
  if (decorator?.confirmType) opts.type = decorator.confirmType
  return await ps.showConfirm(message, title, opts)
}

// ── 数据能力解析 ──────────────────────────────────────────────────────────

export interface ResolvedActionDataCapabilities {
  dataSource: DataView | null
  currentRow: IDataRow | null
  selectedRows: IDataRow[]
}

export function resolveActionDataCapabilities(
  dataKey: string | undefined,
  ctx: ActionExecutionContext,
): ResolvedActionDataCapabilities {
  const empty: ResolvedActionDataCapabilities = { dataSource: null, currentRow: null, selectedRows: [] }
  const scopedView = ctx.getDataSource?.() ?? null

  if (!dataKey) {
    if (!scopedView) return empty
    return {
      dataSource: scopedView,
      currentRow: isRowLike(scopedView.currentRow) ? scopedView.currentRow : null,
      selectedRows: getSelectedRows(scopedView),
    }
  }

  const ds = ctx.getDataSet()
  if (!ds) return empty

  const binding = resolveDataKeyBinding(dataKey, ds)
  if (!binding) return empty

  if (binding.kind === 'view') {
    const dataSource = binding.source as DataView
    return {
      dataSource,
      currentRow: isRowLike(dataSource.currentRow) ? dataSource.currentRow : null,
      selectedRows: getSelectedRows(dataSource),
    }
  }

  const dataSource = getViewFromRawKey(dataKey, ds) ?? null
  return {
    dataSource,
    currentRow: isRowLike(binding.value)
      ? binding.value
      : (dataSource && isRowLike(dataSource.currentRow) ? dataSource.currentRow : null),
    selectedRows: dataSource ? getSelectedRows(dataSource) : [],
  }
}

// ── BuiltinAction 元数据 ──────────────────────────────────────────────────

interface BuiltinActionMeta {
  label: string
}

export const BUILTIN_ACTION_META = {
  'append-row': { label: '新增' },
  'prompt-append': { label: '新增' },
  'prompt-edit': { label: '编辑' },
  'submit-current-form': { label: '保存当前' },
  'clear-rows': { label: '清空' },
  'move-row': { label: '移动' },
  'move-current': { label: '移动当前' },
  'refresh': { label: '刷新' },
  'delete-row': { label: '删除' },
  'delete-current': { label: '删除当前' },
  'delete-selected': { label: '删除选择' },
  'patch-row': { label: '更新' },
  'patch-current': { label: '更新当前' },
  'patch-selected': { label: '批量更新' },
  'message-row': { label: '查看' },
  'message-current': { label: '查看当前' },
} as const satisfies Record<string, BuiltinActionMeta>

export type BuiltinActionName = keyof typeof BUILTIN_ACTION_META

export function isBuiltinActionName(value: string): value is BuiltinActionName {
  return value in BUILTIN_ACTION_META
}

export function getBuiltinActionLabelByName(name: BuiltinActionName): string {
  return BUILTIN_ACTION_META[name].label
}

export function getBuiltinActionName(action: SparkNode): BuiltinActionName | null {
  const propsMap = nodeInputProps(action)
  const actionName = readString(propsMap['action'])
  if (!actionName) return null
  return isBuiltinActionName(actionName) ? actionName : null
}

export function isBuiltinAction(action: SparkNode): boolean {
  return getBuiltinActionName(action) !== null
}

export function getBuiltinActionLabel(action: SparkNode): string {
  const propsMap = nodeInputProps(action)
  const explicit = readString(propsMap['label'])
  if (explicit) return explicit

  const actionName = getBuiltinActionName(action)
  if (!actionName) return '执行'
  return getBuiltinActionLabelByName(actionName)
}

// ── ActionDescriptor 语义禁用判断 ─────────────────────────────────────────

function _normalizeComparable(value: unknown): unknown {
  if (value === '') return null
  return value ?? null
}

function _matchesRowCondition(
  row: IDataRow | null | undefined,
  condition: Record<string, unknown>,
): boolean {
  if (!row) return false
  for (const [field, expected] of Object.entries(condition)) {
    if (_normalizeComparable(row[field]) !== _normalizeComparable(expected)) return false
  }
  return true
}

/**
 * 根据 descriptor 动作语义 + DataView 当前状态 + 执行作用域判断按钮是否禁用。
 */
export function isActionDescriptorDisabled(
  descriptor: ActionDescriptor,
  view: DataView | null | undefined,
  scope?: ActionExecutionScope,
): boolean {
  if (!view) return false

  const uiDesc = descriptor as Partial<{ disabledWhenRow: Record<string, unknown> }>
  if (uiDesc.disabledWhenRow) {
    const checkRow = scope?.row ?? view.currentRow ?? null
    if (_matchesRowCondition(checkRow, uiDesc.disabledWhenRow)) return true
  }

  switch (descriptor.action) {
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
      return getSelectedRows(view).length === 0
    }

    case 'move': {
      const { target } = descriptor
      if (target === 'scope') return scope?.row === undefined
      return view.currentRow === null
    }

    default:
      return false
  }
}
