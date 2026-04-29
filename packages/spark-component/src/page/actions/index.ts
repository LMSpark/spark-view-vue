/**
 * Action 模块入口
 *
 * 导出 action descriptor 类型定义和执行引擎。
 */
export type {
  ActionDescriptor,
  ActionExecutionControl,
  ActionExecutionContext,
  RouterLike,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  AppendRowAction,
  DeleteCurrentAction,
  DeleteSelectedAction,
  RefreshAction,
  PatchCurrentAction,
  SetFieldAction,
  OpenAction,
} from './action-descriptor'

export { isActionDescriptor } from './action-descriptor'
export { executeActionDescriptor } from './action-executor'
export type { ActionExecutionOptions } from './action-executor'
export { extractActionExecutionControl } from './action-control'

export {
  BUILTIN_ACTION_META,
  isBuiltinActionName,
  getBuiltinActionLabelByName,
  getBuiltinActionName,
  isBuiltinAction,
  getBuiltinActionLabel,
} from './builtin-action-meta'
export type { BuiltinActionName, BuiltinActionScope } from './builtin-action-meta'
