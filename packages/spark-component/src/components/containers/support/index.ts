/**
 * @module @spark-appworks/spark-component:components/containers/support/index
 * @spark-appworks/spark-component 的 components/containers/support/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  runControlledInteraction,
  createCancellableControl,
  isCancellableControl,
  createCancelledCrudResult,
} from './interactionControl.js'
export type {
  CancellableControl,
  InteractionControl,
  CancelableHandler,
  AddRowHandler,
  EditRowHandler,
  RemoveRowHandler,
  RowClickHandler,
  CurrentRowChangeHandler,
  RowSelectionHandler,
} from './interactionControl.js'

export {
  useEventDefaults,
} from './useEventDefaults.js'
export type {
  EventDefaultDeclaration,
  EventDispatcher,
} from './useEventDefaults.js'

export {
  isCrudResult,
  isCrudSuccess,
  getCrudErrorMessage,
} from './crud-result-helpers.js'

export { createCrudEventDefaults, createCrudDispatcher } from './crud-defaults.js'

export type {
  BaseCrudContainerApi,
  BaseContainerApi,
  VisibilityContainerApi,
} from './base-container-api.js'

export { createBaseCrudMethods } from './base-crud-methods.js'

export { createToolbarScope, createRowScope, createCurrentRowScope } from './scopeFactories.js'
