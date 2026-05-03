/**
 * Action 模块入口
 *
 * 单一动作真源：descriptor 类型 + executor + node 翻译器。
 */

export type {
  ActionDescriptor,
  ActionDescriptorActionName,
  ActionExecutionContext,
  ActionExecutionControl,
  ActionExecutionScope,
  ActionFormApi,
  ActionPromptConfig,
  ActionRowTarget,
  ActionUiDecorator,
  RouterLike,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  OpenAction,
  SetFieldAction,
  AppendRowAction,
  DeleteAction,
  PatchAction,
  MoveAction,
  MessageRowAction,
  RefreshAction,
  ClearRowsAction,
  SubmitCurrentFormAction,
} from './action-types'

export { isActionDescriptor } from './action-types'
export { executeActionDescriptor } from './action-executor'
export type { ActionExecutionOptions } from './action-executor'
export { extractActionExecutionControl } from './action-executor'

export { nodeToActionDescriptor } from './node-to-descriptor'
export { hasRemoteListApi, getSelectedRows } from './executor-helpers'

export { isActionDescriptorDisabled } from './action-disabled'
export { resolveButtonStyle } from './button-templates'
export type { ButtonTemplateProps, ResolvedButtonStyle } from './button-templates'

export {
  BUILTIN_ACTION_META,
  isBuiltinActionName,
  getBuiltinActionLabelByName,
  getBuiltinActionName,
  isBuiltinAction,
  getBuiltinActionLabel,
} from './builtin-action-meta'
export type { BuiltinActionName } from './builtin-action-meta'
