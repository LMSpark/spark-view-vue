/**
 * 数据相关动作执行器：append-row / delete / patch / move / message-row / refresh / clear-rows / set-field / submit-current-form
 *
 * 单一真源：BuiltinAction 与 bind-normalize 的 on 事件均通过这里执行。
 */

import type { DataView, IDataRow, CrudResult } from '@spark-view/spark-data'
import type {
  ActionExecutionContext,
  ActionExecutionScope,
  ActionRowTarget,
  ActionUiDecorator,
  AppendRowAction,
  ClearRowsAction,
  DeleteAction,
  MessageRowAction,
  MoveAction,
  PatchAction,
  RefreshAction,
  SetFieldAction,
  SubmitCurrentFormAction,
} from './action-types'
import {
  inferNextRowId,
  resolveRowId,
  resolveRowLabel,
  getSelectedRows,
  interpolate,
  asRecord,
  resolveActionDataCapabilities,
  confirmIfNeeded,
  createActionNotifier,
  type ActionNotifier,
} from './executor-helpers'
import { isCrudResult, isCrudSuccess, getCrudErrorMessage } from '../../components/containers/support/crud-result-helpers.js'

// ── target 行解析 ─────────────────────────────────────────────────────────

interface TargetRows {
  rows: IDataRow[]
  /** 单行场景的代表行（current/scope）；selected 时为 null（用 rows） */
  primary: IDataRow | null
}

function resolveTargetRows(
  view: DataView,
  target: ActionRowTarget,
  scope: ActionExecutionScope | undefined,
): TargetRows {
  if (target === 'scope') {
    const row = scope?.row ?? null
    return { rows: row ? [row] : [], primary: row }
  }
  if (target === 'current') {
    const row = view.currentRow ?? null
    return { rows: row ? [row] : [], primary: row }
  }
  // selected
  return { rows: getSelectedRows(view), primary: null }
}

function targetEmptyFallback(target: ActionRowTarget): string {
  return target === 'selected' ? '请先选择记录' : '请先选择当前行'
}

// ── 视图就绪保护 ─────────────────────────────────────────────────────────

function ensureView(
  desc: { dataKey?: string } & ActionUiDecorator,
  ctx: ActionExecutionContext,
  notifier: ActionNotifier,
): DataView | null {
  const { dataSource } = resolveActionDataCapabilities(desc.dataKey, ctx)
  if (!dataSource) {
    const fallback = desc.emptyMessage ?? '数据视图未就绪'
    if (fallback.length > 0) notifier.notify('warning', fallback)
    return null
  }
  return dataSource
}

// ── 父行字段继承（append-row） ───────────────────────────────────────────

function applyInheritFields(
  payload: Record<string, unknown>,
  scope: ActionExecutionScope | undefined,
  inheritFields: string[] | undefined,
  inheritFieldMap: Record<string, string> | undefined,
): Record<string, unknown> {
  const scopeRow = scope?.row
  if (!scopeRow) return payload
  if (inheritFields) {
    for (const field of inheritFields) {
      if (scopeRow[field] !== undefined) payload[field] = scopeRow[field]
    }
  }
  if (inheritFieldMap) {
    for (const [target, source] of Object.entries(inheritFieldMap)) {
      if (typeof source !== 'string' || source.trim().length === 0) continue
      const v = scopeRow[source]
      if (v !== undefined) payload[target] = v
    }
  }
  return payload
}

function resolveCreatedRow(result: IDataRow | CrudResult<IDataRow>): IDataRow | null {
  if (isCrudResult(result)) return result.success && result.data ? result.data : null
  return result
}

// ── append-row ───────────────────────────────────────────────────────────

export async function executeAppendRow(
  desc: AppendRowAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const idField = desc.idField ?? 'id'

  // prompt 模式：弹窗输入字段值后再追加
  if (desc.prompt) {
    const ps = ctx.getPageService()
    if (!ps) return
    const promptOpts: { defaultValue?: string; placeholder?: string } = {}
    if (desc.prompt.defaultValue !== undefined) promptOpts.defaultValue = desc.prompt.defaultValue
    if (desc.prompt.placeholder !== undefined) promptOpts.placeholder = desc.prompt.placeholder
    const result = await ps.showPrompt(
      desc.prompt.message ?? `请输入${desc.prompt.field}`,
      desc.prompt.title ?? '新增',
      promptOpts,
    )
    if (result === null) return

    const payload = applyInheritFields({ ...(desc.appendPayload ?? {}) }, scope, desc.inheritFields, desc.inheritFieldMap)
    payload[desc.prompt.field] = result
    await doAppend(view, payload, idField, desc, scope, notifier)
    return
  }

  const payload = applyInheritFields({ ...(desc.appendPayload ?? {}) }, scope, desc.inheritFields, desc.inheritFieldMap)
  await doAppend(view, payload, idField, desc, scope, notifier)
}

async function doAppend(
  view: DataView,
  payload: Record<string, unknown>,
  idField: string,
  desc: AppendRowAction,
  _scope: ActionExecutionScope | undefined,
  notifier: ActionNotifier,
): Promise<void> {
  if (!(idField in payload) || payload[idField] === undefined || payload[idField] === null) {
    payload[idField] = inferNextRowId(view, idField)
  }
  const result = await view.addRow(payload as IDataRow)
  if (isCrudResult(result) && !result.success) {
    notifier.notify('warning', desc.failureMessage
      ? interpolate(desc.failureMessage, {}, null)
      : getCrudErrorMessage(result, '新增失败'))
    return
  }

  const created = resolveCreatedRow(result)
  if (desc.setCurrentRowOnSuccess === true && created) {
    const id = resolveRowId(created, idField)
    if (id !== null) view.setCurrentRowById(id)
    else view.setCurrentRow(created)
  }
  notifier.notify('success', desc.successMessage ?? '新增成功')
}

// ── delete ───────────────────────────────────────────────────────────────

export async function executeDelete(
  desc: DeleteAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const { rows, primary } = resolveTargetRows(view, desc.target, scope)
  if (rows.length === 0) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const idField = desc.idField ?? 'id'
  const count = rows.length

  if (desc.target === 'selected') {
    const decoratorOverride: ActionUiDecorator = { ...desc }
    if (desc.confirmMessage !== undefined) {
      decoratorOverride.confirmMessage = interpolate(desc.confirmMessage, { count }, null)
    }
    const allowed = await confirmIfNeeded(
      ctx,
      decoratorOverride,
      `确认删除已选择的 ${count} 条记录吗？`,
      desc.confirmTitle ?? '批量删除确认',
    )
    if (!allowed) return

    let removed = 0
    for (const row of rows) {
      const id = resolveRowId(row, idField)
      if (id === null) continue
      const r = await view.removeRow(id)
      if (isCrudSuccess(r)) removed += 1
    }
    if (removed > 0) {
      notifier.notify(
        'success',
        desc.successMessage
          ? interpolate(desc.successMessage, { count: removed }, null)
          : `已删除 ${removed} 条记录`,
      )
    } else {
      notifier.notify('warning', desc.failureMessage ?? '未删除任何记录')
    }
    return
  }

  // single row (scope / current)
  const row = primary
  if (!row) return
  const label = resolveRowLabel(row, idField)
  const allowed = await confirmIfNeeded(ctx, desc, `确认删除 ${label} 吗？`, desc.confirmTitle ?? '删除确认')
  if (!allowed) return

  const id = resolveRowId(row, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }
  const result = await view.removeRow(id)
  if (isCrudSuccess(result)) {
    notifier.notify('success', desc.successMessage ?? `已删除 ${label}`)
    return
  }
  notifier.notify(
    'warning',
    isCrudResult(result)
      ? getCrudErrorMessage(result, desc.failureMessage ?? '删除失败：记录不存在或已删除')
      : (desc.failureMessage ?? '删除失败：记录不存在或已删除'),
  )
}

// ── patch ────────────────────────────────────────────────────────────────

function resolveStaticPatch(desc: PatchAction): Partial<IDataRow> {
  const out: Record<string, unknown> = { ...(desc.patch ?? {}) }
  if (desc.field !== undefined) out[desc.field] = desc.value
  return out
}

export async function executePatch(
  desc: PatchAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const { rows, primary } = resolveTargetRows(view, desc.target, scope)
  if (rows.length === 0) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const idField = desc.idField ?? 'id'

  // prompt 模式：弹窗输入字段值
  if (desc.prompt) {
    if (desc.target === 'selected') {
      notifier.notifyError('prompt 模式不支持 selected target')
      return
    }
    const row = primary
    if (!row) return
    const ps = ctx.getPageService()
    if (!ps) return
    const id = resolveRowId(row, idField)
    if (id === null) {
      notifier.notifyError(`当前行缺少主键字段: ${idField}`)
      return
    }
    const currentVal = row[desc.prompt.field]
    const defaultVal = typeof currentVal === 'string'
      ? currentVal
      : (typeof currentVal === 'number' ? String(currentVal) : '')
    const promptOpts: { defaultValue: string; placeholder?: string } = { defaultValue: defaultVal }
    if (desc.prompt.placeholder !== undefined) promptOpts.placeholder = desc.prompt.placeholder
    const result = await ps.showPrompt(
      desc.prompt.message ?? `请输入${desc.prompt.field}`,
      desc.prompt.title ?? '编辑',
      promptOpts,
    )
    if (result === null) return
    await doUpdate(view, id, { [desc.prompt.field]: result }, desc, notifier, '更新成功', '更新失败')
    return
  }

  const patch = resolveStaticPatch(desc)
  if (Object.keys(patch).length === 0) {
    notifier.notify('warning', '缺少 patch/field 配置，无法更新')
    return
  }

  if (desc.target === 'selected') {
    let updated = 0
    for (const row of rows) {
      const id = resolveRowId(row, idField)
      if (id === null) continue
      const r = await view.editRowById(id, patch)
      if (isCrudSuccess(r)) updated += 1
    }
    if (updated > 0) {
      notifier.notify(
        'success',
        desc.successMessage
          ? interpolate(desc.successMessage, { count: updated }, null)
          : `已更新 ${updated} 条记录`,
      )
    } else {
      notifier.notify('warning', desc.failureMessage ?? '未更新任何记录')
    }
    return
  }

  const row = primary
  if (!row) return
  const id = resolveRowId(row, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }
  await doUpdate(view, id, patch, desc, notifier, '更新成功', '更新失败：记录不存在或已删除')
}

async function doUpdate(
  view: DataView,
  id: string | number,
  patch: Partial<IDataRow>,
  decorator: ActionUiDecorator,
  notifier: ActionNotifier,
  successFallback: string,
  failureFallback: string,
): Promise<void> {
  const result = await view.editRowById(id, patch)
  if (isCrudSuccess(result)) {
    notifier.notify('success', decorator.successMessage ?? successFallback)
    return
  }
  notifier.notify(
    'warning',
    isCrudResult(result)
      ? getCrudErrorMessage(result, decorator.failureMessage ?? failureFallback)
      : (decorator.failureMessage ?? failureFallback),
  )
}

// ── move (tree) ──────────────────────────────────────────────────────────

function resolveMoveTargetParentId(
  view: DataView,
  desc: MoveAction,
  scope: ActionExecutionScope | undefined,
  idField: string,
): string | number | null {
  if (Object.prototype.hasOwnProperty.call(desc, 'newParentId')) {
    const literal = desc.newParentId
    return typeof literal === 'string' || typeof literal === 'number' ? literal : null
  }
  if (desc.targetParentSource === 'field') {
    const field = desc.targetParentField
    const row = scope?.row ?? view.currentRow
    if (!field || !row) return null
    const v = row[field]
    return typeof v === 'string' || typeof v === 'number' ? v : null
  }
  if (desc.targetParentSource === 'scope') {
    return scope?.row ? resolveRowId(scope.row, idField) : null
  }
  return view.currentRow ? resolveRowId(view.currentRow, idField) : null
}

export async function executeMove(
  desc: MoveAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const row = desc.target === 'scope' ? scope?.row : view.currentRow
  if (!row) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const idField = desc.idField ?? 'id'
  const id = resolveRowId(row, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }

  const mover = view as DataView & {
    moveTreeNode?: (nodeId: string | number, newParentId: string | number | null, index?: number) => Promise<IDataRow | null>
  }
  if (typeof mover.moveTreeNode !== 'function') {
    notifier.notify('warning', desc.failureMessage ?? '移动失败')
    return
  }

  const newParentId = resolveMoveTargetParentId(view, desc, scope, idField)
  await mover.moveTreeNode(id, newParentId, desc.index)
  notifier.notify('success', desc.successMessage ?? '移动成功')
}

// ── message-row ──────────────────────────────────────────────────────────

export function executeMessageRow(
  desc: MessageRowAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): void {
  const notifier = createActionNotifier(ctx, desc)
  const { dataSource } = resolveActionDataCapabilities(desc.dataKey, ctx)
  if (!dataSource) {
    if (desc.emptyMessage) notifier.notify('warning', desc.emptyMessage)
    return
  }

  const row = desc.target === 'scope' ? scope?.row : dataSource.currentRow
  if (!row) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const text = formatRowMessage(row, desc)
  notifier.notify(desc.messageType ?? 'info', text)
}

function formatRowMessage(row: IDataRow, desc: MessageRowAction): string {
  if (desc.message) return interpolate(desc.message, {}, row)
  if (desc.messageFields && desc.messageFields.length > 0) {
    return desc.messageFields.map(f => `${f}: ${String(row[f] ?? '-')}`).join(' | ')
  }
  const compact = Object.fromEntries(
    Object.entries(row).filter(([k]) => k !== '_perm').slice(0, 6),
  )
  return JSON.stringify(compact)
}

// ── refresh / clear-rows ─────────────────────────────────────────────────

export async function executeRefresh(
  desc: RefreshAction,
  ctx: ActionExecutionContext,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  await view.refresh()
  notifier.notify('success', desc.successMessage ?? '刷新完成')
}

export async function executeClearRows(
  desc: ClearRowsAction,
  ctx: ActionExecutionContext,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const allowed = await confirmIfNeeded(ctx, desc, '确认清空当前列表吗？', desc.confirmTitle ?? '清空确认')
  if (!allowed) return

  view.replaceRows([])
  view.selection.setCurrentRow(null)
  view.selection.clearSelectedRows()
  notifier.notify('success', desc.successMessage ?? '已清空当前列表')
}

// ── set-field（无装饰，与 patch 区分：不弹消息） ─────────────────────────

export async function executeSetField(desc: SetFieldAction, ctx: ActionExecutionContext): Promise<void> {
  const { dataSource, currentRow } = resolveActionDataCapabilities(desc.dataKey, ctx)
  if (!dataSource || !currentRow) return
  const idField = desc.idField ?? 'id'
  const id = resolveRowId(currentRow, idField)
  if (id === null) return
  await dataSource.editRowById(id, { [desc.field]: desc.value })
}

// ── submit-current-form ──────────────────────────────────────────────────

export async function executeSubmitCurrentForm(
  desc: SubmitCurrentFormAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const formApi = scope?.formApi
  if (!formApi) {
    notifier.notify('warning', desc.emptyMessage ?? '表单 API 未就绪')
    return
  }

  const { dataSource } = resolveActionDataCapabilities(desc.dataKey, ctx)
  if (!dataSource) {
    notifier.notify('warning', desc.emptyMessage ?? '数据视图未就绪')
    return
  }

  const idField = desc.idField ?? 'id'
  const formRow = formApi.getCurrentRow()
  const targetRow = formRow ?? dataSource.currentRow
  if (!targetRow) {
    notifier.notify('warning', '请先选择当前行')
    return
  }
  const id = resolveRowId(targetRow, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }

  if (typeof formApi.validate === 'function') {
    const valid = await formApi.validate()
    if (!valid) {
      notifier.notify('warning', desc.validateMessage ?? '请先修正表单校验错误')
      return
    }
  }

  const draft = asRecord(formApi.getFormData())
  if (!draft) {
    notifier.notify('warning', '当前表单数据不可用')
    return
  }

  const result = await dataSource.editRowById(id, draft)
  if (isCrudSuccess(result)) {
    notifier.notify('success', desc.successMessage ?? '保存成功')
    return
  }
  notifier.notify(
    'warning',
    isCrudResult(result)
      ? getCrudErrorMessage(result, desc.failureMessage ?? '保存失败')
      : (desc.failureMessage ?? '保存失败'),
  )
}
