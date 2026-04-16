import { createCrudEventDefaults } from './crud-event-defaults.js'
import { useEventDefaults, type EventDefaultDeclaration, type EventDispatcher } from './useEventDefaults.js'

export function createCrudDispatcher(
  handlerSource: Readonly<Record<string, unknown>>,
  extraDeclarations: Readonly<Record<string, EventDefaultDeclaration>> = {},
): { dispatch: EventDispatcher } {
  return useEventDefaults(createCrudEventDefaults(extraDeclarations), handlerSource)
}
