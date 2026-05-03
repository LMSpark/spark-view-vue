import { useEventDefaults, type EventDefaultDeclaration, type EventDispatcher } from './useEventDefaults.js'

export function createCrudEventDefaults(
  extraDeclarations: Readonly<Record<string, EventDefaultDeclaration>> = {},
): Readonly<Record<string, EventDefaultDeclaration>> {
  return {
    'add-row': {},
    'edit-row': {},
    'remove-row': {},
    ...extraDeclarations,
  }
}

export function createCrudDispatcher(
  handlerSource: Readonly<Record<string, unknown>>,
  extraDeclarations: Readonly<Record<string, EventDefaultDeclaration>> = {},
): { dispatch: EventDispatcher } {
  return useEventDefaults(createCrudEventDefaults(extraDeclarations), handlerSource)
}
