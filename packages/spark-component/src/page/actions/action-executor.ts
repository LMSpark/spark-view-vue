/**
 * Action Descriptor 执行引擎
 *
 * 解析并执行声明式 action descriptor，提供框架无关的行为执行能力。
 * 被 normalizeRuleEvents（on 事件）和 容器 wrapper 区域（如 `r-toolbar` / `r-actions`）共同使用。
 */

import type {
  ActionDescriptor,
  ActionExecutionControl,
  ActionExecutionContext,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  ScriptCallAction,
  AppendRowAction,
  DeleteCurrentAction,
  DeleteSelectedAction,
  RefreshAction,
  PatchCurrentAction,
  SetFieldAction,
  OpenAction,
} from './action-descriptor'

import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { PageMessageType } from '@spark-view/spark-utils'
import { extractActionExecutionControl } from './action-control'
import { isCrudResult, isCrudSuccess, getCrudErrorMessage } from '../../components/containers/support/crud-result-helpers.js'
import { resolveViewFromDataKey } from '../../shared/data-key-resolver.js'

// ── 视图查找辅助 ──────────────────────────────────────────────────────────

/**
 * 从 dataKey 解析目标 DataView
 *
 * - 有 dataKey → 解析到具体视图
 * - 无 dataKey → 取 DataSet 中第一个表的 default 视图
 */
function resolveView(dataKey: string | undefined, ctx: ActionExecutionContext): DataView | null {
  const ds = ctx.getDataSet()
  if (!ds) return null

  if (dataKey) {
    return resolveViewFromDataKey(dataKey, ds)
  }

  // 无 dataKey: 取第一个表的 default 视图
  for (const tableName of Object.keys(ds.tables)) {
    const view = ds.getView(tableName, 'default')
    if (view) return view
  }
  return null
}

export interface ActionExecutionOptions {
  eventArgs?: unknown[]
  control?: ActionExecutionControl
}

function resolveRowId(row: IDataRow, idField: string): string | number | null {
  const raw = row[idField]
  return typeof raw === 'string' || typeof raw === 'number' ? raw : null
}

function inferNextRowId(view: DataView, idField: string): string | number {
  const numericIds = view.rows
    .map(row => row[idField])
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
  if (numericIds.length > 0) return Math.max(...numericIds) + 1
  return `row-${Date.now()}`
}

function interpolatePath(template: string, row: IDataRow | null): string {
  if (!row) return template
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key: string) => {
    const val = row[key]
    return val !== null && val !== undefined ? String(val) : ''
  })
}

// ── 执行引擎 ──────────────────────────────────────────────────────────────

/**
 * 执行单个 action descriptor
 *
 * @param descriptor 声明式动作描述
 * @param ctx 运行时上下文（延迟求值）
 * @param eventArgs 原始 DOM/Vue 事件参数（透传给 script 调用）
 */
export async function executeActionDescriptor(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  eventArgsOrOptions?: unknown[] | ActionExecutionOptions,
): Promise<void> {
  const options = Array.isArray(eventArgsOrOptions)
    ? { eventArgs: eventArgsOrOptions }
    : (eventArgsOrOptions ?? {})
  const eventArgs = options.eventArgs
  const control = options.control

  if (descriptor.cancelDefault && control) {
    control.cancel = true
  }

  const action = descriptor.action

  switch (action) {
    case 'script':
      executeScript(descriptor, ctx, eventArgs)
      break
    case 'show-message':
      executeShowMessage(descriptor, ctx)
      break
    case 'confirm':
      await executeConfirm(descriptor, ctx, eventArgs, control)
      break
    case 'alert':
      await executeAlert(descriptor, ctx)
      break
    case 'navigate':
      executeNavigate(descriptor, ctx, eventArgs)
      break
    case 'append-row':
      await executeAppendRow(descriptor, ctx)
      break
    case 'delete-current':
      await executeDeleteCurrent(descriptor, ctx)
      break
    case 'delete-selected':
      await executeDeleteSelected(descriptor, ctx)
      break
    case 'refresh':
      await executeRefresh(descriptor, ctx)
      break
    case 'patch-current':
      await executePatchCurrent(descriptor, ctx)
      break
    case 'set-field':
      await executeSetField(descriptor, ctx)
      break
    case 'open':
      executeOpen(descriptor)
      break
    default:
      if (import.meta.env.DEV) {
        console.warn(`[action-executor] 未知 action 类型: ${action}`)
      }
      return
  }

  // 链式执行
  if (descriptor.then) {
    const nextOptions: ActionExecutionOptions = {}
    if (eventArgs !== undefined) nextOptions.eventArgs = eventArgs
    if (control !== undefined) nextOptions.control = control
    await executeActionDescriptor(descriptor.then, ctx, nextOptions)
  }
}

// ── 各动作实现 ────────────────────────────────────────────────────────────

function executeScript(desc: ScriptCallAction, ctx: ActionExecutionContext, eventArgs?: unknown[]): void {
  ctx.callFunc(desc.fn, ...(eventArgs ?? []))
}

function executeShowMessage(desc: ShowMessageAction, ctx: ActionExecutionContext): void {
  const ps = ctx.getPageService()
  if (ps) ps.showMessage(desc.message, desc.messageType ?? 'info')
}

async function executeConfirm(
  desc: ShowConfirmAction,
  ctx: ActionExecutionContext,
  eventArgs?: unknown[],
  control?: ActionExecutionControl,
): Promise<void> {
  const ps = ctx.getPageService()
  if (!ps) return

  const confirmOpts: { type?: PageMessageType } = {}
  if (desc.confirmType) confirmOpts.type = desc.confirmType
  const confirmed = await ps.showConfirm(
    desc.message,
    desc.title ?? '确认',
    confirmOpts,
  )
  const nestedControl = control ?? extractActionExecutionControl(eventArgs)

  if (confirmed && desc.onConfirm) {
    const confirmOptions: ActionExecutionOptions = {}
    if (eventArgs !== undefined) confirmOptions.eventArgs = eventArgs
    if (nestedControl !== undefined) confirmOptions.control = nestedControl
    await executeActionDescriptor(desc.onConfirm, ctx, confirmOptions)
  }
  if (!confirmed && desc.onCancel) {
    const cancelOptions: ActionExecutionOptions = {}
    if (eventArgs !== undefined) cancelOptions.eventArgs = eventArgs
    if (nestedControl !== undefined) cancelOptions.control = nestedControl
    await executeActionDescriptor(desc.onCancel, ctx, cancelOptions)
  }
}

async function executeAlert(desc: ShowAlertAction, ctx: ActionExecutionContext): Promise<void> {
  const ps = ctx.getPageService()
  if (ps) await ps.showAlert(desc.message, desc.title, {})
}

function executeNavigate(desc: NavigateAction, ctx: ActionExecutionContext, eventArgs?: unknown[]): void {
  const router = ctx.getRouter()
  if (!router) return

  let path = desc.path
  if (path.includes('{')) {
    // 优先从事件参数取行数据（如 row-click 的 row），回退到 currentRow
    const eventRow = eventArgs?.[0]
    const rowFromEvent = (eventRow !== null && eventRow !== undefined && typeof eventRow === 'object' && !Array.isArray(eventRow))
      ? eventRow as IDataRow
      : null
    const fallbackRow = resolveView(undefined, ctx)?.currentRow ?? null
    path = interpolatePath(path, rowFromEvent ?? fallbackRow)
  }

  void router.push(path)
}

async function executeAppendRow(desc: AppendRowAction, ctx: ActionExecutionContext): Promise<void> {
  const view = resolveView(desc.dataKey, ctx)
  if (!view) return

  const idField = desc.idField ?? 'id'
  const payload: Record<string, unknown> = { ...(desc.payload ?? {}) }
  if (!(idField in payload) || payload[idField] === undefined || payload[idField] === null) {
    payload[idField] = inferNextRowId(view, idField)
  }

  const ps = ctx.getPageService()
  const result = await view.addRow(payload as IDataRow)
  if (ps) {
    ps.showMessage(
      isCrudResult(result) && !result.success ? getCrudErrorMessage(result, '新增失败') : '新增成功',
      isCrudResult(result) && !result.success ? 'warning' : 'success'
    )
  }
}

async function executeDeleteCurrent(desc: DeleteCurrentAction, ctx: ActionExecutionContext): Promise<void> {
  const view = resolveView(desc.dataKey, ctx)
  if (!view) return

  const row = view.currentRow
  if (!row) {
    const ps = ctx.getPageService()
    if (ps) ps.showMessage('请先选择当前行', 'warning')
    return
  }

  if (desc.confirmMessage) {
    const ps = ctx.getPageService()
    if (ps) {
      const ok = await ps.showConfirm(desc.confirmMessage)
      if (!ok) return
    }
  }

  const idField = desc.idField ?? 'id'
  const id = resolveRowId(row, idField)
  if (id !== null) {
    const deleted = await view.removeRow(id)
    const ps = ctx.getPageService()
    if (ps) {
      const deleteMessage = isCrudResult(deleted)
        ? (deleted.success ? '已删除' : getCrudErrorMessage(deleted, '删除失败'))
        : (deleted ? '已删除' : '删除失败')
      ps.showMessage(
        deleteMessage,
        isCrudSuccess(deleted) ? 'success' : 'warning'
      )
    }
  }
}

async function executeDeleteSelected(desc: DeleteSelectedAction, ctx: ActionExecutionContext): Promise<void> {
  const view = resolveView(desc.dataKey, ctx)
  if (!view) return

  const selectedRows: IDataRow[] = Array.isArray(view.selectedRows) ? view.selectedRows : []
  if (selectedRows.length === 0) {
    const ps = ctx.getPageService()
    if (ps) ps.showMessage('请先勾选记录', 'warning')
    return
  }

  if (desc.confirmMessage) {
    const ps = ctx.getPageService()
    if (ps) {
      const ok = await ps.showConfirm(desc.confirmMessage ?? `确认删除已勾选的 ${selectedRows.length} 条记录吗？`)
      if (!ok) return
    }
  }

  const idField = desc.idField ?? 'id'
  let removed = 0
  for (const row of [...selectedRows]) {
    const id = resolveRowId(row, idField)
    if (id === null) continue
    const deleted = await view.removeRow(id)
    if (isCrudSuccess(deleted)) removed++
  }

  const ps = ctx.getPageService()
  if (ps) {
    ps.showMessage(removed > 0 ? `已删除 ${removed} 条记录` : '未删除任何记录', removed > 0 ? 'success' : 'warning')
  }
}

async function executeRefresh(desc: RefreshAction, ctx: ActionExecutionContext): Promise<void> {
  const view = resolveView(desc.dataKey, ctx)
  if (!view) return

  if (!view.dataTable?.api?.list) {
    const ps = ctx.getPageService()
    if (ps) ps.showMessage('当前数据为内联数据，无需刷新', 'warning')
    return
  }

  await view.refresh()
  const ps = ctx.getPageService()
  if (ps) ps.showMessage('刷新完成', 'success')
}

async function executePatchCurrent(desc: PatchCurrentAction, ctx: ActionExecutionContext): Promise<void> {
  const view = resolveView(desc.dataKey, ctx)
  if (!view) return

  const row = view.currentRow
  if (!row) {
    const ps = ctx.getPageService()
    if (ps) ps.showMessage('请先选择当前行', 'warning')
    return
  }

  const idField = desc.idField ?? 'id'
  const id = resolveRowId(row, idField)
  if (id === null) return

  const patch: Record<string, unknown> = { ...(desc.patch ?? {}) }
  if (desc.field !== undefined) {
    patch[desc.field] = desc.value
  }

  if (Object.keys(patch).length > 0) {
    const ps = ctx.getPageService()
    const result = await view.editRowById(id, patch)
    if (ps) {
      const updateMessage = isCrudResult(result)
        ? (result.success ? '更新成功' : getCrudErrorMessage(result, '更新失败'))
        : (result ? '更新成功' : '更新失败')
      ps.showMessage(
        updateMessage,
        isCrudSuccess(result) ? 'success' : 'warning'
      )
    }
  }
}

async function executeSetField(desc: SetFieldAction, ctx: ActionExecutionContext): Promise<void> {
  const view = resolveView(desc.dataKey, ctx)
  if (!view) return

  const row = view.currentRow
  if (!row) return

  const idField = desc.idField ?? 'id'
  const id = resolveRowId(row, idField)
  if (id === null) return

  await view.editRowById(id, { [desc.field]: desc.value })
}

function executeOpen(desc: OpenAction): void {
  // 通过 DOM 事件通知目标 dialog/drawer 打开
  // 未来可改为 SPARK 能力链通信
  const event = new CustomEvent('spark:open', { detail: { target: desc.target }, bubbles: true })
  document.dispatchEvent(event)
}
