/**
 * Form 相关动作：submit-current-form
 *
 * 依赖 ActionExecutionScope.formApi（由 RendererForm 在调用时挂入）。
 */

import type {
  ActionExecutionContext,
  ActionExecutionScope,
  SubmitCurrentFormAction,
} from '../action-descriptor'
import { resolveActionDataCapabilities } from '../data-capabilities'
import { resolveRowId, asRecord } from '../executor-helpers'
import { createActionNotifier } from '../action-notifier'
import { isCrudResult, isCrudSuccess, getCrudErrorMessage } from '../../../components/containers/support/crud-result-helpers.js'

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
