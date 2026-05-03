/**
 * SparkNode → ActionDescriptor 翻译器
 *
 * 把 BuiltinAction（按钮 props.action）扁平字段映射为统一 descriptor。
 * 调用方拿到 descriptor 后由 executeActionDescriptor 执行。
 */

import type { SparkNode } from '../../core/types'
import { nodeInputProps } from '../../core/types'
import type {
  ActionDescriptor,
  ActionPromptConfig,
  ActionRowTarget,
  ActionUiDecorator,
  AppendRowAction,
  ClearRowsAction,
  DeleteAction,
  MessageRowAction,
  MoveAction,
  PatchAction,
  RefreshAction,
  SubmitCurrentFormAction,
} from './action-types'
import { isBuiltinActionName, type BuiltinActionName } from './builtin-action-meta'
import { asRecord, readString } from './executor-helpers'
import {
  readBoolean,
  readOptionalMessageType,
  readOptionalStringArray,
} from './executor-helpers'
/** 提取所有共有装饰字段（除 silent 外都 optional） */
function pickDecorator(props: Record<string, unknown>): ActionUiDecorator {
  const out: ActionUiDecorator = {}
  if (readBoolean(props['silent']) === true) out.silent = true

  const successMessage = props['successMessage']
  if (typeof successMessage === 'string') out.successMessage = successMessage

  const failureMessage = props['failureMessage']
  if (typeof failureMessage === 'string') out.failureMessage = failureMessage

  const emptyMessage = props['emptyMessage']
  if (typeof emptyMessage === 'string') out.emptyMessage = emptyMessage

  const errorMessage = props['errorMessage']
  if (typeof errorMessage === 'string') out.errorMessage = errorMessage

  const confirmMessage = props['confirmMessage']
  if (typeof confirmMessage === 'string') out.confirmMessage = confirmMessage

  const confirmTitle = readString(props['confirmTitle'])
  if (confirmTitle) out.confirmTitle = confirmTitle

  const confirmType = readOptionalMessageType(props['confirmType'])
  if (confirmType) out.confirmType = confirmType

  const disabledWhenRow = asRecord(props['disabledWhenRow'])
  if (disabledWhenRow) out.disabledWhenRow = disabledWhenRow

  return out
}

function pickPrompt(props: Record<string, unknown>, defaultMode: 'append' | 'edit'): ActionPromptConfig | undefined {
  const field = readString(props['field'])
  if (!field) return undefined
  const cfg: ActionPromptConfig = { field }
  const message = readString(props['promptMessage'])
  if (message) cfg.message = message
  const title = readString(props['promptTitle'])
  if (title) cfg.title = title
  const placeholder = readString(props['placeholder'])
  if (placeholder) cfg.placeholder = placeholder
  // append: 用 defaultValue（配置）；edit: defaultValue 由 executor 用 row[field] 推断
  if (defaultMode === 'append') {
    const dv = readString(props['defaultValue'])
    if (dv !== undefined) cfg.defaultValue = dv
  }
  return cfg
}

function pickIdField(props: Record<string, unknown>): string | undefined {
  return readString(props['idField'])
}

function pickDataKey(props: Record<string, unknown>): string | undefined {
  return readString(props['dataKey'])
}

/**
 * 把 SparkNode（按钮）翻译为 ActionDescriptor。
 * 不命中内置动作名 → null（由调用方走 onClick 路径）。
 */
export function nodeToActionDescriptor(node: SparkNode): ActionDescriptor | null {
  const props = nodeInputProps(node)
  const rawAction = readString(props['action'])
  if (!rawAction || !isBuiltinActionName(rawAction)) return null
  return mapBuiltinAction(rawAction, props)
}

function mapBuiltinAction(name: BuiltinActionName, props: Record<string, unknown>): ActionDescriptor | null {
  const decorator = pickDecorator(props)
  const dataKey = pickDataKey(props)
  const idField = pickIdField(props)

  switch (name) {
    case 'append-row': {
      const desc: AppendRowAction = { action: 'append-row', ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      const payload = asRecord(props['appendPayload'])
      if (payload) desc.appendPayload = payload
      const inheritFields = readOptionalStringArray(props['inheritFields'])
      if (inheritFields) desc.inheritFields = inheritFields
      const inheritFieldMap = asRecord(props['inheritFieldMap'])
      if (inheritFieldMap) desc.inheritFieldMap = inheritFieldMap as Record<string, string>
      if (readBoolean(props['setCurrentRowOnSuccess']) === true) desc.setCurrentRowOnSuccess = true
      return desc
    }

    case 'prompt-append': {
      const desc: AppendRowAction = { action: 'append-row', ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      const payload = asRecord(props['appendPayload'])
      if (payload) desc.appendPayload = payload
      const inheritFields = readOptionalStringArray(props['inheritFields'])
      if (inheritFields) desc.inheritFields = inheritFields
      const inheritFieldMap = asRecord(props['inheritFieldMap'])
      if (inheritFieldMap) desc.inheritFieldMap = inheritFieldMap as Record<string, string>
      if (readBoolean(props['setCurrentRowOnSuccess']) === true) desc.setCurrentRowOnSuccess = true
      const prompt = pickPrompt(props, 'append')
      if (prompt) desc.prompt = prompt
      return desc
    }

    case 'prompt-edit': {
      const target: ActionRowTarget = readString(props['targetRow']) === 'current' ? 'current' : 'scope'
      const desc: PatchAction = { action: 'patch', target, ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      const prompt = pickPrompt(props, 'edit')
      if (prompt) desc.prompt = prompt
      return desc
    }

    case 'submit-current-form': {
      const desc: SubmitCurrentFormAction = { action: 'submit-current-form', ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      const validateMessage = readString(props['validateMessage'])
      if (validateMessage) desc.validateMessage = validateMessage
      return desc
    }

    case 'clear-rows': {
      const desc: ClearRowsAction = { action: 'clear-rows', ...decorator }
      if (dataKey) desc.dataKey = dataKey
      return desc
    }

    case 'refresh': {
      const desc: RefreshAction = { action: 'refresh', ...decorator }
      if (dataKey) desc.dataKey = dataKey
      return desc
    }

    case 'move-row':
    case 'move-current': {
      const target = name === 'move-row' ? 'scope' : 'current'
      const desc: MoveAction = { action: 'move', target, ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      if (Object.prototype.hasOwnProperty.call(props, 'newParentId')) {
        const v = props['newParentId']
        if (typeof v === 'string' || typeof v === 'number' || v === null) desc.newParentId = v
      }
      const tps = readString(props['targetParentSource'])
      if (tps === 'field' || tps === 'scope') desc.targetParentSource = tps
      const tpf = readString(props['targetParentField'])
      if (tpf) desc.targetParentField = tpf
      const idx = props['index']
      if (typeof idx === 'number' && Number.isFinite(idx)) desc.index = idx
      return desc
    }

    case 'delete-row':
    case 'delete-current':
    case 'delete-selected': {
      const target: ActionRowTarget =
        name === 'delete-row' ? 'scope' : name === 'delete-current' ? 'current' : 'selected'
      const desc: DeleteAction = { action: 'delete', target, ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      return desc
    }

    case 'patch-row':
    case 'patch-current':
    case 'patch-selected': {
      const target: ActionRowTarget =
        name === 'patch-row' ? 'scope' : name === 'patch-current' ? 'current' : 'selected'
      const desc: PatchAction = { action: 'patch', target, ...decorator }
      if (dataKey) desc.dataKey = dataKey
      if (idField) desc.idField = idField
      const patch = asRecord(props['patch'])
      if (patch) desc.patch = patch
      const field = readString(props['field'])
      if (field) {
        desc.field = field
        if ('value' in props) desc.value = props['value']
      }
      return desc
    }

    case 'message-row':
    case 'message-current': {
      const target = name === 'message-row' ? 'scope' : 'current'
      const desc: MessageRowAction = { action: 'message-row', target, ...decorator }
      if (dataKey) desc.dataKey = dataKey
      const message = readString(props['message'])
      if (message) desc.message = message
      const messageFields = readOptionalStringArray(props['messageFields'])
      if (messageFields) desc.messageFields = messageFields
      const messageType = readOptionalMessageType(props['messageType'])
      if (messageType) desc.messageType = messageType
      return desc
    }
  }
}
