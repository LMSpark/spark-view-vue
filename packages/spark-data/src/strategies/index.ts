/**
 * strategies barrel export
 */
export { CrudDelegate } from './crud-delegate'
export { CascadeDelegate } from './cascade-delegate'
export { SelectionDelegate } from './selection-delegate'
export { createCrudLifecycleEvent } from './types'
export type { ICrudHost, ICascadeHost, ISelectionHost, EmitStateChangedFn, CrudOperation, CrudLifecycleEvent, EmitCrudLifecycleFn } from './types'
