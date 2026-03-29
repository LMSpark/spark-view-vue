import type { EventDefaultDeclaration } from './useEventDefaults.js'

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