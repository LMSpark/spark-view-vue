/**
 * 内置声明式动作映射（builtin-action）
 *
 * 从 RendererTable.vue 提取的零脚本动作系统：
 *  - 动作名校验与类型（BuiltinActionName）
 *  - 标签映射、按钮样式查询
 *  - 禁用逻辑（行/选中/当前行感知）
 *  - 执行处理器（append / refresh / delete / patch / message）
 *
 * 容器组件（r-table 等）通过 createBuiltinActionHandler 构建实例后使用。
 */

import type { SparkNode } from '../internal'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import type { PageMessageType, IPageServiceCapability, LoggerApi } from '@spark-view/spark-utils'

// ── 类型定义 ──────────────────────────────────────────────────────────────

export type BuiltinButtonType = 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type BuiltinButtonSize = 'large' | 'default' | 'small'

interface BuiltinActionMeta {
  label: string
  buttonType?: BuiltinButtonType
  buttonSize?: BuiltinButtonSize
  buttonPlain?: boolean
  buttonText?: boolean
  buttonLink?: boolean
  buttonClass?: string
}

const BUILTIN_ACTION_META = {
  'append-row': { label: '新增', buttonType: 'primary' },
  'prompt-append': { label: '新增', buttonType: 'primary' },
  'prompt-edit': { label: '编辑', buttonType: 'success' },
  'move-row': { label: '移动', buttonType: 'warning', buttonPlain: true },
  'move-current': { label: '移动当前', buttonType: 'warning', buttonPlain: true },
  'refresh': { label: '刷新' },
  'delete-row': { label: '删除', buttonType: 'danger', buttonPlain: true },
  'delete-current': { label: '删除当前', buttonType: 'danger', buttonPlain: true },
  'delete-selected': { label: '删除勾选', buttonType: 'danger', buttonPlain: true },
  'patch-row': { label: '更新', buttonType: 'success' },
  'patch-current': { label: '更新当前', buttonType: 'success' },
  'patch-selected': { label: '批量更新', buttonType: 'success' },
  'message-row': { label: '查看', buttonType: 'info', buttonPlain: true },
  'message-current': { label: '查看当前', buttonType: 'info', buttonPlain: true },
} as const satisfies Record<string, BuiltinActionMeta>

type BuiltinActionName = keyof typeof BUILTIN_ACTION_META

const BUILTIN_ACTION_META_RECORD: Record<BuiltinActionName, BuiltinActionMeta> = BUILTIN_ACTION_META

interface BuiltinActionScope {
  row?: IDataRow
  index?: number
}

/** 执行上下文：由容器组件在运行时提供 */
interface BuiltinActionContext {
  getView: () => DataView | null | undefined
  getPageService: () => IPageServiceCapability | null | undefined
  getLogger: () => LoggerApi
  hasRemoteListApi: (view: DataView) => boolean
}

// ── 纯函数：值解析辅助 ───────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readButtonType(value: unknown): BuiltinButtonType | undefined {
  const text = readString(value)
  if (!text) return undefined
  const allowed: BuiltinButtonType[] = ['primary', 'success', 'warning', 'danger', 'info']
  return allowed.includes(text as BuiltinButtonType) ? text as BuiltinButtonType : undefined
}

function readButtonSize(value: unknown): BuiltinButtonSize | undefined {
  const text = readString(value)
  if (!text) return undefined
  const allowed: BuiltinButtonSize[] = ['large', 'default', 'small']
  return allowed.includes(text as BuiltinButtonSize) ? text as BuiltinButtonSize : undefined
}

function readMessageType(value: unknown): PageMessageType {
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

function getActionProps(action: SparkNode): Record<string, unknown> {
  return asRecord(action.props) ?? {}
}

function hasOwnProp(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function resolveConfiguredText(record: Record<string, unknown>, key: string, fallback: string): string {
  if (!hasOwnProp(record, key)) return fallback
  const raw = record[key]
  if (typeof raw === 'string') return raw.trim()
  return ''
}

// ── 动作名校验 ────────────────────────────────────────────────────────────

function isBuiltinActionName(value: string): value is BuiltinActionName {
  return value in BUILTIN_ACTION_META
}

function getBuiltinActionName(action: SparkNode): BuiltinActionName | null {
  const actionName = readString(getActionProps(action)['builtinAction'])
  if (!actionName) return null
  return isBuiltinActionName(actionName) ? actionName : null
}

export function isBuiltinAction(action: SparkNode): boolean {
  return getBuiltinActionName(action) !== null
}

// ── 标签映射 ──────────────────────────────────────────────────────────────

export function getBuiltinActionLabel(action: SparkNode): string {
  const propsMap = getActionProps(action)
  const explicit = readString(propsMap['label'])
  if (explicit) return explicit

  const actionName = getBuiltinActionName(action)
  if (!actionName) return '执行'
  return BUILTIN_ACTION_META_RECORD[actionName].label
}

// ── 按钮样式查询 ──────────────────────────────────────────────────────────

export function getBuiltinButtonType(action: SparkNode): BuiltinButtonType | undefined {
  const propsMap = getActionProps(action)
  const explicit = readButtonType(propsMap['buttonType'])
  if (explicit !== undefined) return explicit

  const actionName = getBuiltinActionName(action)
  return actionName ? BUILTIN_ACTION_META_RECORD[actionName].buttonType : undefined
}

export function getBuiltinButtonSize(action: SparkNode): BuiltinButtonSize | undefined {
  const propsMap = getActionProps(action)
  const explicit = readButtonSize(propsMap['buttonSize'])
  if (explicit !== undefined) return explicit

  const actionName = getBuiltinActionName(action)
  return actionName ? BUILTIN_ACTION_META_RECORD[actionName].buttonSize : undefined
}

export function getBuiltinButtonPlain(action: SparkNode): boolean {
  const propsMap = getActionProps(action)
  const explicit = readBoolean(propsMap['buttonPlain'])
  if (explicit !== undefined) return explicit

  const actionName = getBuiltinActionName(action)
  return actionName ? (BUILTIN_ACTION_META_RECORD[actionName].buttonPlain ?? false) : false
}

export function getBuiltinButtonText(action: SparkNode): boolean {
  const propsMap = getActionProps(action)
  const explicit = readBoolean(propsMap['buttonText'])
  if (explicit !== undefined) return explicit

  const actionName = getBuiltinActionName(action)
  return actionName ? (BUILTIN_ACTION_META_RECORD[actionName].buttonText ?? false) : false
}

export function getBuiltinButtonLink(action: SparkNode): boolean {
  const propsMap = getActionProps(action)
  const explicit = readBoolean(propsMap['buttonLink'])
  if (explicit !== undefined) return explicit

  const actionName = getBuiltinActionName(action)
  return actionName ? (BUILTIN_ACTION_META_RECORD[actionName].buttonLink ?? false) : false
}

export function getBuiltinButtonClass(action: SparkNode): string {
  const propsMap = getActionProps(action)
  const explicit = readString(propsMap['buttonClass'])
  if (explicit !== undefined) return explicit

  const actionName = getBuiltinActionName(action)
  return actionName ? (BUILTIN_ACTION_META_RECORD[actionName].buttonClass ?? '') : ''
}

// ── 行辅助 ────────────────────────────────────────────────────────────────

/** 安全读取 DataView 的 selectedRows（null-guard），供容器 & 内置动作共用 */
export function getSelectedRows(view: DataView): IDataRow[] {
  return Array.isArray(view.selectedRows) ? view.selectedRows : []
}

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

function resolveEditTargetRow(
  view: DataView,
  scope: BuiltinActionScope | undefined,
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

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }
  return ''
}

// ── 禁用逻辑 ──────────────────────────────────────────────────────────────

export function isBuiltinActionDisabled(
  action: SparkNode,
  view: DataView | null | undefined,
  scope?: BuiltinActionScope,
): boolean {
  const propsMap = getActionProps(action)
  if (readBoolean(propsMap['buttonDisabled']) === true) return true

  const actionName = getBuiltinActionName(action)
  if (!actionName || !view) return false

  switch (actionName) {
    case 'append-row':
    case 'prompt-append':
    case 'refresh':
      return false
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
          if (!(idField in payload) || payload[idField] === undefined || payload[idField] === null) {
            payload[idField] = inferNextRowId(view, idField)
          }
          view.appendRow(payload as IDataRow)
          notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '新增成功'))
          return
        }
        case 'prompt-append': {
          const pageService = ctx.getPageService()
          if (!pageService) return
          const field = readString(propsMap['field'])
          if (!field) {
            notifyAction(propsMap, 'warning', '缺少 field 配置')
            return
          }
          const promptMsg = readString(propsMap['promptMessage']) ?? `请输入${readString(propsMap['label']) ?? field}`
          const promptTitle = readString(propsMap['promptTitle']) ?? '新增'
          const promptOpts: { defaultValue?: string; placeholder?: string } = {}
          const dv = readString(propsMap['defaultValue'])
          if (dv !== undefined) promptOpts.defaultValue = dv
          const ph = readString(propsMap['placeholder'])
          if (ph !== undefined) promptOpts.placeholder = ph
          const result = await pageService.showPrompt(promptMsg, promptTitle, promptOpts)
          if (result === null) return
          const appendPayload = applyScopeRowAppendPayload({ ...(asRecord(propsMap['appendPayload']) ?? {}) }, scope, propsMap)
          appendPayload[field] = result
          if (!(idField in appendPayload) || appendPayload[idField] === undefined || appendPayload[idField] === null) {
            appendPayload[idField] = inferNextRowId(view, idField)
          }
          view.appendRow(appendPayload as IDataRow)
          notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '新增成功'))
          return
        }
        case 'prompt-edit': {
          const pageService = ctx.getPageService()
          if (!pageService) return
          const row = resolveEditTargetRow(view, scope, propsMap)
          if (!row) {
            notifyAction(propsMap, 'warning', '请先选择当前行')
            return
          }
          const field = readString(propsMap['field'])
          if (!field) {
            notifyAction(propsMap, 'warning', '缺少 field 配置')
            return
          }
          const id = resolveRowId(row, idField)
          if (id === null) {
            notifyAction(propsMap, 'error', `当前行缺少主键字段: ${idField}`)
            return
          }
          const currentVal = row[field]
          const defaultVal = typeof currentVal === 'string' ? currentVal : (typeof currentVal === 'number' ? String(currentVal) : '')
          const editMsg = readString(propsMap['promptMessage']) ?? `请输入${readString(propsMap['label']) ?? field}`
          const editTitle = readString(propsMap['promptTitle']) ?? '编辑'
          const editOpts: { defaultValue?: string; placeholder?: string } = { defaultValue: defaultVal }
          const editPh = readString(propsMap['placeholder'])
          if (editPh !== undefined) editOpts.placeholder = editPh
          const result = await pageService.showPrompt(editMsg, editTitle, editOpts)
          if (result === null) return
          if (view.updateRowById(id, { [field]: result })) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '更新成功'))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '更新失败'))
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
        case 'move-row': {
          const row = scope?.row
          if (!row) {
            notifyAction(propsMap, 'warning', '当前行不可用')
            return
          }
          const moved = await executeTreeMove(view, row, propsMap, idField)
          notifyAction(
            propsMap,
            moved ? 'success' : 'warning',
            resolveConfiguredText(propsMap, moved ? 'successMessage' : 'failureMessage', moved ? '移动成功' : '移动失败')
          )
          return
        }
        case 'move-current': {
          const row = view.currentRow
          if (!row) {
            notifyAction(propsMap, 'warning', '请先选择当前行')
            return
          }
          const moved = await executeTreeMove(view, row, propsMap, idField)
          notifyAction(
            propsMap,
            moved ? 'success' : 'warning',
            resolveConfiguredText(propsMap, moved ? 'successMessage' : 'failureMessage', moved ? '移动成功' : '移动失败')
          )
          return
        }
        case 'delete-row': {
          const row = scope?.row
          if (!row) {
            notifyAction(propsMap, 'warning', '当前行不可用')
            return
          }
          const rowLabel = resolveRowLabel(row, idField)
          const allowed = await confirmAction(propsMap, `确认删除 ${rowLabel} 吗？`, '删除确认')
          if (!allowed) return
          const id = resolveRowId(row, idField)
          if (id === null) {
            notifyAction(propsMap, 'error', `当前行缺少主键字段: ${idField}`)
            return
          }
          if (view.deleteRowById(id)) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', `已删除 ${rowLabel}`))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '删除失败：记录不存在或已删除'))
          return
        }
        case 'delete-current': {
          const row = view.currentRow
          if (!row) {
            notifyAction(propsMap, 'warning', '请先选择当前行')
            return
          }
          const rowLabel = resolveRowLabel(row, idField)
          const allowed = await confirmAction(propsMap, `确认删除 ${rowLabel} 吗？`, '删除确认')
          if (!allowed) return
          const id = resolveRowId(row, idField)
          if (id === null) {
            notifyAction(propsMap, 'error', `当前行缺少主键字段: ${idField}`)
            return
          }
          if (view.deleteRowById(id)) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', `已删除 ${rowLabel}`))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '删除失败：记录不存在或已删除'))
          return
        }
        case 'delete-selected': {
          const selectedRows = getSelectedRows(view)
          if (selectedRows.length === 0) {
            notifyAction(propsMap, 'warning', '请先勾选记录')
            return
          }
          const allowed = await confirmAction(propsMap, `确认删除已勾选的 ${selectedRows.length} 条记录吗？`, '批量删除确认')
          if (!allowed) return
          let removed = 0
          for (const row of [...selectedRows]) {
            const id = resolveRowId(row, idField)
            if (id !== null && view.deleteRowById(id)) removed++
          }
          if (removed > 0) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', `已删除 ${removed} 条记录`))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '未删除任何记录'))
          return
        }
        case 'patch-row': {
          const row = scope?.row
          if (!row) {
            notifyAction(propsMap, 'warning', '当前行不可用')
            return
          }
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
          if (view.updateRowById(id, patch)) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '更新成功'))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '更新失败：记录不存在或已删除'))
          return
        }
        case 'patch-current': {
          const row = view.currentRow
          if (!row) {
            notifyAction(propsMap, 'warning', '请先选择当前行')
            return
          }
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
          if (view.updateRowById(id, patch)) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', '更新成功'))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '更新失败：记录不存在或已删除'))
          return
        }
        case 'patch-selected': {
          const selectedRows = getSelectedRows(view)
          if (selectedRows.length === 0) {
            notifyAction(propsMap, 'warning', '请先勾选记录')
            return
          }
          const patch = resolvePatch(propsMap)
          if (Object.keys(patch).length === 0) {
            notifyAction(propsMap, 'warning', '缺少 patch/field 配置，无法更新')
            return
          }
          let updated = 0
          for (const row of selectedRows) {
            const id = resolveRowId(row, idField)
            if (id !== null && view.updateRowById(id, patch)) updated++
          }
          if (updated > 0) {
            notifyAction(propsMap, 'success', resolveConfiguredText(propsMap, 'successMessage', `已更新 ${updated} 条记录`))
            return
          }
          notifyAction(propsMap, 'warning', resolveConfiguredText(propsMap, 'failureMessage', '未更新任何记录'))
          return
        }
        case 'message-row': {
          const row = scope?.row
          if (!row) {
            notifyAction(propsMap, 'warning', '当前行不可用')
            return
          }
          notifyAction(propsMap, readMessageType(propsMap['messageType']), formatRowMessage(row, propsMap))
          return
        }
        case 'message-current': {
          const row = view.currentRow
          if (!row) {
            notifyAction(propsMap, 'warning', '请先选择当前行')
            return
          }
          notifyAction(propsMap, readMessageType(propsMap['messageType']), formatRowMessage(row, propsMap))
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
