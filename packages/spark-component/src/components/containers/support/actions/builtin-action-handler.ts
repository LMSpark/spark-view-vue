/**
 * 内置声明式动作系统 — 执行处理器工厂
 *
 * 容器组件通过 createBuiltinActionHandler 构建绑定上下文后,
 * 将 handleToolbar / handleRow 交由 RendererHostScope 分发给子动作按钮。
 */

import type { CrudResult, IDataRow, DataView } from '@spark-view/spark-data'
import type { IPageServiceCapability, PageMessageType } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { isCrudResult, isCrudSuccess, getCrudErrorMessage } from '../crud-result-helpers.js'
import { getBuiltinActionName, getBuiltinActionLabel } from '../../../../page/actions/index.js'
import type { BuiltinActionScope } from '../../../../page/actions/index.js'
import {
  readString,
  readBoolean,
  readStringArray,
  readMessageType,
  getActionProps,
  asRecord,
  hasOwnProp,
  resolveConfiguredText,
  extractErrorMessage,
  getSelectedRows,
  resolveEditTargetRow,
} from './builtin-action-helpers'

// ── 执行上下文 ────────────────────────────────────────────────────────────

interface BuiltinActionContext {
  getView: () => DataView | null | undefined
  getPageService: () => IPageServiceCapability | null | undefined
  getLogger: () => LoggerApi
  hasRemoteListApi: (view: DataView) => boolean
  getFormApi?: () => {
    getCurrentRow(): IDataRow | null
    getFormData(): Record<string, unknown>
    validate?(): Promise<boolean>
  } | null | undefined
}

// ── 行辅助 ────────────────────────────────────────────────────────────────

function getIdField(propsMap: Record<string, unknown>): string {
  return readString(propsMap['idField']) ?? 'id'
}

function resolveRowId(row: IDataRow, idField: string): string | number | null {
  const raw = row[idField]
  return typeof raw === 'string' || typeof raw === 'number' ? raw : null
}

function inferNextRowId(view: DataView, idField: string): string | number {
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

function applyScopeRowAppendPayload(
  appendPayload: Record<string, unknown>,
  scope: BuiltinActionScope | undefined,
  propsMap: Record<string, unknown>,
): Record<string, unknown> {
  const scopeRow = scope?.row
  if (!scopeRow) return appendPayload

  for (const field of readStringArray(propsMap['inheritFields'])) {
    if (scopeRow[field] !== undefined) {
      appendPayload[field] = scopeRow[field]
    }
  }

  const inheritFieldMap = asRecord(propsMap['inheritFieldMap']) ?? {}
  for (const [targetField, sourceField] of Object.entries(inheritFieldMap)) {
    if (typeof sourceField !== 'string' || sourceField.trim().length === 0) continue
    const value = scopeRow[sourceField]
    if (value !== undefined) {
      appendPayload[targetField] = value
    }
  }

  return appendPayload
}

function resolveMoveTargetParentId(
  view: DataView,
  scope: BuiltinActionScope | undefined,
  propsMap: Record<string, unknown>,
  idField: string,
): string | number | null {
  if (hasOwnProp(propsMap, 'newParentId')) {
    const literal = propsMap['newParentId']
    return typeof literal === 'string' || typeof literal === 'number'
      ? literal
      : literal === null || literal === undefined
        ? null
        : null
  }

  const source = readString(propsMap['targetParentSource'])
  if (source === 'field') {
    const field = readString(propsMap['targetParentField'])
    const row = scope?.row ?? view.currentRow
    if (!field || !row) return null
    const value = row[field]
    return typeof value === 'string' || typeof value === 'number'
      ? value
      : value === null || value === undefined
        ? null
        : null
  }

  if (source === 'scope') {
    return scope?.row ? resolveRowId(scope.row, idField) : null
  }

  return view.currentRow ? resolveRowId(view.currentRow, idField) : null
}

async function executeTreeMove(
  view: DataView,
  row: IDataRow,
  propsMap: Record<string, unknown>,
  idField: string,
): Promise<boolean> {
  const mover = view as DataView & {
    moveTreeNode?: (nodeId: string | number, newParentId: string | number | null, index?: number) => Promise<IDataRow | null>
  }
  if (typeof mover.moveTreeNode !== 'function') return false

  const id = resolveRowId(row, idField)
  if (id === null) return false

  const newParentId = resolveMoveTargetParentId(view, { row }, propsMap, idField)
  const rawIndex = propsMap['index']
  const index = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? rawIndex : undefined
  await mover.moveTreeNode(id, newParentId, index)
  return true
}

function resolvePatch(propsMap: Record<string, unknown>): Partial<IDataRow> {
  const patch = asRecord(propsMap['patch']) ?? {}
  const resolved: Record<string, unknown> = { ...patch }
  const field = readString(propsMap['field'])
  if (field !== undefined) {
    resolved[field] = propsMap['value']
  }
  return resolved
}

function resolveRowLabel(row: IDataRow, idField: string): string {
  const candidates = ['orderNo', 'name', 'title', idField]
  for (const key of candidates) {
    const value = row[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return '当前记录'
}

function resolveCreatedRow(result: IDataRow | CrudResult<IDataRow>): IDataRow | null {
  if (isCrudResult(result)) {
    return result.success && result.data ? result.data : null
  }
  return result
}

function setCurrentRowAfterCreate(
  view: DataView,
  createdRow: IDataRow | null,
  idField: string,
  propsMap: Record<string, unknown>,
): void {
  if (readBoolean(propsMap['setCurrentRowOnSuccess']) !== true || !createdRow) return
  const id = resolveRowId(createdRow, idField)
  if (id !== null) {
    view.setCurrentRowById(id)
    return
  }
  view.setCurrentRow(createdRow)
}

function formatRowMessage(row: IDataRow, propsMap: Record<string, unknown>): string {
  const template = readString(propsMap['message'])
  if (template) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => String(row[key] ?? '-'))
  }

  const fields = readStringArray(propsMap['messageFields'])
  if (fields.length > 0) {
    return fields.map(field => `${field}: ${String(row[field] ?? '-')}`).join(' | ')
  }

  const compact = Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== '_perm')
      .slice(0, 6)
  )
  return JSON.stringify(compact)
}

function clearViewAtTableLevel(view: DataView): void {
  view.replaceRows([])
  // 清空行后同步重置选择态，避免 UI/数据态残留。
  view.selection.setCurrentRow(null)
  view.selection.clearSelectedRows()
}

// ── 执行处理器工厂 ───────────────────────────────────────────────────────

/**
 * 创建绑定到容器上下文的动作处理器。
 *
 * 使用方式：
 * ```ts
 * const handler = createBuiltinActionHandler({
 *   getView: () => resolvedView.value,
 *   getPageService: () => pageService,
 *   getLogger: () => logger,
 *   hasRemoteListApi: (view) => Boolean(view.dataTable?.api?.list),
 * })
 *
 * // 工具栏点击
 * handler.handleToolbar(action)
 * // 行操作点击
 * handler.handleRow(action, row, index)
 * ```
 */
export function createBuiltinActionHandler(ctx: BuiltinActionContext) {

  function notify(type: PageMessageType, message: string): void {
    if (message.trim().length === 0) return
    const pageService = ctx.getPageService()
    if (pageService) {
      pageService.showMessage(message, type)
      return
    }
    if (import.meta.env.DEV) {
      ctx.getLogger().warn(`builtin-action: PAGE_SERVICE 不可用，消息未展示: ${message}`)
    }
  }

  function notifyAction(propsMap: Record<string, unknown>, type: PageMessageType, message: string): void {
    if (readBoolean(propsMap['silent']) === true) return
    notify(type, message)
  }

  async function confirmAction(propsMap: Record<string, unknown>, fallbackMessage: string, fallbackTitle: string): Promise<boolean> {
    const pageService = ctx.getPageService()
    if (!pageService) return true

    const message = resolveConfiguredText(propsMap, 'confirmMessage', fallbackMessage)
    if (message.trim().length === 0) return true

    const title = resolveConfiguredText(propsMap, 'confirmTitle', fallbackTitle)
    const type = readMessageType(propsMap['confirmType'])

    return await pageService.showConfirm(message, title, { type })
  }

  async function executeDeleteAction(
    view: DataView,
    row: IDataRow,
    propsMap: Record<string, unknown>,
    idField: string,
  ): Promise<void> {
    const rowLabel = resolveRowLabel(row, idField)
    const allowed = await confirmAction(propsMap, `确认删除 ${rowLabel} 吗？`, '删除确认')
    if (!allowed) return

    const id = resolveRowId(row, idField)
    if (id === null) {
      notifyAction(propsMap, 'error', `当前行缺少主键字段: ${idField}`)
      return
    }

    const deleteResult = await view.removeRow(id)
    if (isCrudSuccess(deleteResult)) {
      notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', `已删除 ${rowLabel}`))
      return
    }

    notifyAction(
      propsMap,
      'warning',
      isCrudResult(deleteResult)
        ? getCrudErrorMessage(deleteResult, resolveConfiguredText(propsMap, 'failureMessage', '删除失败：记录不存在或已删除'))
        : resolveConfiguredText(propsMap, 'failureMessage', '删除失败：记录不存在或已删除')
    )
  }

  function getScopeRowOrWarn(scope: BuiltinActionScope | undefined, propsMap: Record<string, unknown>): IDataRow | null {
    const row = scope?.row
    if (!row) {
      notifyAction(propsMap, 'warning', '当前行不可用')
      return null
    }
    return row
  }

  function getCurrentRowOrWarn(view: DataView, propsMap: Record<string, unknown>): IDataRow | null {
    const row = view.currentRow
    if (!row) {
      notifyAction(propsMap, 'warning', '请先选择当前行')
      return null
    }
    return row
  }

  function getSelectedRowsOrWarn(view: DataView, propsMap: Record<string, unknown>): IDataRow[] | null {
    const selectedRows = getSelectedRows(view)
    if (selectedRows.length === 0) {
      notifyAction(propsMap, 'warning', '请先勾选记录')
      return null
    }
    return selectedRows
  }

  async function executeSelectedRowsAction(
    rows: readonly IDataRow[],
    propsMap: Record<string, unknown>,
    executeRow: (row: IDataRow) => Promise<boolean>,
    successMessage: (count: number) => string,
    failureMessage: string,
  ): Promise<void> {
    let affected = 0
    for (const row of rows) {
      if (await executeRow(row)) {
        affected += 1
      }
    }
    if (affected > 0) {
      notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', successMessage(affected)))
      return
    }
    notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', failureMessage))
  }

  async function executeSelectedRowsByIdAction(
    rows: readonly IDataRow[],
    propsMap: Record<string, unknown>,
    idField: string,
    executeById: (id: string | number) => Promise<boolean>,
    successMessage: (count: number) => string,
    failureMessage: string,
  ): Promise<void> {
    await executeSelectedRowsAction(
      rows,
      propsMap,
      async (row) => {
        const id = resolveRowId(row, idField)
        if (id === null) return false
        return await executeById(id)
      },
      successMessage,
      failureMessage,
    )
  }

  async function executeAppendAction(
    view: DataView,
    payload: Record<string, unknown>,
    propsMap: Record<string, unknown>,
    idField: string,
  ): Promise<void> {
    if (!(idField in payload) || payload[idField] === undefined || payload[idField] === null) {
      payload[idField] = inferNextRowId(view, idField)
    }
    const appendResult = await view.addRow(payload as IDataRow)
    if (isCrudResult(appendResult) && !appendResult.success) {
      notifyAction(propsMap, 'warning', getCrudErrorMessage(appendResult, resolveConfiguredText(propsMap, 'failureMessage', '新增失败')))
      return
    }
    setCurrentRowAfterCreate(view, resolveCreatedRow(appendResult), idField, propsMap)
    notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '新增成功'))
  }

  async function executeMoveAction(
    view: DataView,
    row: IDataRow,
    propsMap: Record<string, unknown>,
    idField: string,
  ): Promise<void> {
    const moved = await executeTreeMove(view, row, propsMap, idField)
    notifyAction(
      propsMap,
      moved ? 'success' : 'warning',
      resolveConfiguredText(propsMap, moved ? 'successMessage' : 'failureMessage', moved ? '移动成功' : '移动失败')
    )
  }

  async function executeUpdateByIdAction(
    view: DataView,
    id: string | number,
    patch: Partial<IDataRow>,
    propsMap: Record<string, unknown>,
    successFallback: string,
    failureFallback: string,
  ): Promise<void> {
    const updateResult = await view.editRowById(id, patch)
    if (isCrudSuccess(updateResult)) {
      notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', successFallback))
      return
    }

    notifyAction(
      propsMap,
      'warning',
      isCrudResult(updateResult)
        ? getCrudErrorMessage(updateResult, resolveConfiguredText(propsMap, 'failureMessage', failureFallback))
        : resolveConfiguredText(propsMap, 'failureMessage', failureFallback)
    )
  }

  async function executePatchAction(
    view: DataView,
    row: IDataRow,
    propsMap: Record<string, unknown>,
    idField: string,
  ): Promise<void> {
    const id = resolveRowId(row, idField)
    if (id === null) {
      notifyAction(propsMap, 'error', `当前行缺少主键字段: ${idField}`)
      return
    }

    const patch = resolvePatch(propsMap)
    if (Object.keys(patch).length === 0) {
      notifyAction(propsMap, 'warning', '缺少 patch/field 配置，无法更新')
      return
    }
    await executeUpdateByIdAction(view, id, patch, propsMap, '更新成功', '更新失败：记录不存在或已删除')
  }

  function executeMessageAction(row: IDataRow, propsMap: Record<string, unknown>): void {
    notifyAction(propsMap, readMessageType(propsMap['messageType']), formatRowMessage(row, propsMap))
  }

  function resolveRowIdOrWarn(
    row: IDataRow,
    propsMap: Record<string, unknown>,
    idField: string,
  ): string | number | null {
    const id = resolveRowId(row, idField)
    if (id === null) {
      notifyAction(propsMap, 'error', `当前行缺少主键字段: ${idField}`)
      return null
    }
    return id
  }

  function resolveEditRowAndIdOrWarn(
    view: DataView,
    scope: BuiltinActionScope | undefined,
    propsMap: Record<string, unknown>,
    idField: string,
  ): { row: IDataRow; id: string | number } | null {
    const row = resolveEditTargetRow(view, scope, propsMap)
    if (!row) {
      notifyAction(propsMap, 'warning', '请先选择当前行')
      return null
    }
    const id = resolveRowIdOrWarn(row, propsMap, idField)
    if (id === null) return null
    return { row, id }
  }

  function resolveCurrentRowAndIdOrWarn(
    view: DataView,
    propsMap: Record<string, unknown>,
    idField: string,
  ): { row: IDataRow; id: string | number } | null {
    const row = getCurrentRowOrWarn(view, propsMap)
    if (!row) return null
    const id = resolveRowIdOrWarn(row, propsMap, idField)
    if (id === null) return null
    return { row, id }
  }

  function resolvePromptFieldOrWarn(propsMap: Record<string, unknown>): string | null {
    const field = readString(propsMap['field'])
    if (!field) {
      notifyAction(propsMap, 'warning', '缺少 field 配置')
      return null
    }
    return field
  }

  function resolvePromptMessageAndTitle(
    propsMap: Record<string, unknown>,
    field: string,
    fallbackTitle: string,
  ): { message: string; title: string } {
    const message = readString(propsMap['promptMessage']) ?? `请输入${readString(propsMap['label']) ?? field}`
    const title = readString(propsMap['promptTitle']) ?? fallbackTitle
    return { message, title }
  }

  function resolvePromptOptions(
    propsMap: Record<string, unknown>,
    options?: { defaultValue?: string; useConfiguredDefaultValue?: boolean },
  ): { defaultValue?: string; placeholder?: string } {
    const promptOptions: { defaultValue?: string; placeholder?: string } = {}

    if (options?.defaultValue !== undefined) {
      promptOptions.defaultValue = options.defaultValue
    } else if (options?.useConfiguredDefaultValue === true) {
      const configuredDefaultValue = readString(propsMap['defaultValue'])
      if (configuredDefaultValue !== undefined) {
        promptOptions.defaultValue = configuredDefaultValue
      }
    }

    const placeholder = readString(propsMap['placeholder'])
    if (placeholder !== undefined) {
      promptOptions.placeholder = placeholder
    }

    return promptOptions
  }

  async function execute(action: SparkNode, scope?: BuiltinActionScope): Promise<void> {
    const actionName = getBuiltinActionName(action)
    if (!actionName) return

    const view = ctx.getView()
    const propsMap = getActionProps(action)
    if (!view) {
      notifyAction(propsMap, 'warning', readString(propsMap['emptyMessage']) ?? '数据视图未就绪')
      return
    }

    const idField = getIdField(propsMap)

    try {
      switch (actionName) {
        case 'append-row': {
          const payload = applyScopeRowAppendPayload({ ...(asRecord(propsMap['appendPayload']) ?? {}) }, scope, propsMap)
          await executeAppendAction(view, payload, propsMap, idField)
          return
        }
        case 'prompt-append': {
          const pageService = ctx.getPageService()
          if (!pageService) return
          const field = resolvePromptFieldOrWarn(propsMap)
          if (!field) return
          const prompt = resolvePromptMessageAndTitle(propsMap, field, '新增')
          const promptOpts = resolvePromptOptions(propsMap, { useConfiguredDefaultValue: true })
          const result = await pageService.showPrompt(prompt.message, prompt.title, promptOpts)
          if (result === null) return
          const appendPayload = applyScopeRowAppendPayload({ ...(asRecord(propsMap['appendPayload']) ?? {}) }, scope, propsMap)
          appendPayload[field] = result
          await executeAppendAction(view, appendPayload, propsMap, idField)
          return
        }
        case 'prompt-edit': {
          const pageService = ctx.getPageService()
          if (!pageService) return
          const target = resolveEditRowAndIdOrWarn(view, scope, propsMap, idField)
          if (!target) return
          const { row, id } = target
          const field = resolvePromptFieldOrWarn(propsMap)
          if (!field) return
          const currentVal = row[field]
          const defaultVal = typeof currentVal === 'string' ? currentVal : (typeof currentVal === 'number' ? String(currentVal) : '')
          const prompt = resolvePromptMessageAndTitle(propsMap, field, '编辑')
          const editOpts = resolvePromptOptions(propsMap, { defaultValue: defaultVal })
          const result = await pageService.showPrompt(prompt.message, prompt.title, editOpts)
          if (result === null) return
          await executeUpdateByIdAction(view, id, { [field]: result }, propsMap, '更新成功', '更新失败')
          return
        }
        case 'submit-current-form': {
          const formApi = ctx.getFormApi?.()
          if (!formApi) {
            notifyAction(propsMap, 'warning', readString(propsMap['emptyMessage']) ?? '表单 API 未就绪')
            return
          }
          const formRow = formApi.getCurrentRow()
          const target = formRow
            ? (() => {
                const formId = resolveRowIdOrWarn(formRow, propsMap, idField)
                return formId === null ? null : { row: formRow, id: formId }
              })()
            : resolveCurrentRowAndIdOrWarn(view, propsMap, idField)
          if (!target) return
          const { id } = target
          if (typeof formApi.validate === 'function') {
            const valid = await formApi.validate()
            if (!valid) {
              notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'validateMessage', '请先修正表单校验错误'))
              return
            }
          }
          const draft = asRecord(formApi.getFormData())
          if (!draft) {
            notifyAction(propsMap, 'warning', '当前表单数据不可用')
            return
          }
          await executeUpdateByIdAction(view, id, draft, propsMap, '保存成功', '保存失败')
          return
        }
        case 'refresh': {
          if (!ctx.hasRemoteListApi(view)) {
            notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'emptyMessage', '当前数据为内联数据，无需刷新'))
            return
          }
          await view.refresh()
          notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '刷新完成'))
          return
        }
        case 'clear-rows': {
          const allowed = await confirmAction(propsMap, '确认清空当前列表吗？', '清空确认')
          if (!allowed) return
          clearViewAtTableLevel(view)
          notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '已清空当前列表'))
          return
        }
        case 'move-row': {
          const row = getScopeRowOrWarn(scope, propsMap)
          if (!row) return
          await executeMoveAction(view, row, propsMap, idField)
          return
        }
        case 'move-current': {
          const row = getCurrentRowOrWarn(view, propsMap)
          if (!row) return
          await executeMoveAction(view, row, propsMap, idField)
          return
        }
        case 'delete-row': {
          const row = getScopeRowOrWarn(scope, propsMap)
          if (!row) return
          await executeDeleteAction(view, row, propsMap, idField)
          return
        }
        case 'delete-current': {
          const row = getCurrentRowOrWarn(view, propsMap)
          if (!row) return
          await executeDeleteAction(view, row, propsMap, idField)
          return
        }
        case 'delete-selected': {
          const selectedRows = getSelectedRowsOrWarn(view, propsMap)
          if (!selectedRows) return
          const allowed = await confirmAction(propsMap, `确认删除已勾选的 ${selectedRows.length} 条记录吗？`, '批量删除确认')
          if (!allowed) return
          await executeSelectedRowsByIdAction(
            selectedRows,
            propsMap,
            idField,
            async (id) => {
              const deleteResult = await view.removeRow(id)
              return isCrudSuccess(deleteResult)
            },
            count => `已删除 ${count} 条记录`,
            '未删除任何记录'
          )
          return
        }
        case 'patch-row': {
          const row = getScopeRowOrWarn(scope, propsMap)
          if (!row) return
          await executePatchAction(view, row, propsMap, idField)
          return
        }
        case 'patch-current': {
          const row = getCurrentRowOrWarn(view, propsMap)
          if (!row) return
          await executePatchAction(view, row, propsMap, idField)
          return
        }
        case 'patch-selected': {
          const selectedRows = getSelectedRowsOrWarn(view, propsMap)
          if (!selectedRows) return
          const patch = resolvePatch(propsMap)
          if (Object.keys(patch).length === 0) {
            notifyAction(propsMap, 'warning', '缺少 patch/field 配置，无法更新')
            return
          }
          await executeSelectedRowsByIdAction(
            selectedRows,
            propsMap,
            idField,
            async (id) => {
              const patchResult = await view.editRowById(id, patch)
              return isCrudSuccess(patchResult)
            },
            count => `已更新 ${count} 条记录`,
            '未更新任何记录'
          )
          return
        }
        case 'message-row': {
          const row = getScopeRowOrWarn(scope, propsMap)
          if (!row) return
          executeMessageAction(row, propsMap)
          return
        }
        case 'message-current': {
          const row = getCurrentRowOrWarn(view, propsMap)
          if (!row) return
          executeMessageAction(row, propsMap)
          return
        }
      }
    } catch (error: unknown) {
      const detail = extractErrorMessage(error)
      const fallback = resolveConfiguredText(propsMap, 'errorMessage', `${getBuiltinActionLabel(action)}失败`)
      const message = detail.length > 0 ? `${fallback}: ${detail}` : fallback
      notifyAction(propsMap, 'error', message)
      if (import.meta.env.DEV) {
        ctx.getLogger().warn(`builtin-action 执行失败 action=${actionName} message=${message}`)
      }
    }
  }

  return {
    handleToolbar(action: SparkNode): void {
      void execute(action)
    },
    handleRow(action: SparkNode, row: IDataRow, index: number): void {
      void execute(action, { row, index })
    },
  }
}
