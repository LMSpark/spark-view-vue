/**
 * @module @spark-appworks/spark-component:components/containers/support/crud-defaults
 * @spark-appworks/spark-component 的 components/containers/support/crud-defaults 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
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
