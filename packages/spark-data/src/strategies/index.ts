/**
 * strategies barrel export
 */
export { CrudDelegate } from './crud-delegate'
export { CascadeDelegate } from './cascade-delegate'
export { SelectionDelegate } from './selection-delegate'
export { LocalMutationDelegate } from './local-mutation-delegate'
export { createCrudLifecycleEvent } from './types'
export type { ICrudHost, ICascadeHost, ISelectionHost, ILocalMutationHost, CrudOperation, CrudLifecycleEvent } from './types'
