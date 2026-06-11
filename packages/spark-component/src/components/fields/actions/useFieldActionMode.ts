/**
 * @module @spark-appworks/spark-component:components/fields/actions/useFieldActionMode
 * @spark-appworks/spark-component 的 components/fields/actions/useFieldActionMode 模块。
 * 导出 ClassModel symbol: FieldActionMode, UseFieldActionModeOptions, UseFieldActionModeReturn（共 3 个 symbol）。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'

/** Field Action Mode 的语义模型。 */
export type FieldActionMode = 'editable' | 'readonly'

/** Use Field Action Mode Options 的调用配置。 */
type UseFieldActionModeOptions = {
    /** 是否 is Editable。 */
isEditable: ComputedRef<boolean>}

/** Use Field Action Mode Return 的语义模型。 */
type UseFieldActionModeReturn = {
    /** action Mode 字段。 */
actionMode: ComputedRef<FieldActionMode>
    /** choose By Mode 回调。 */
chooseByMode: <T>(editableValue: T, readonlyValue: T) => ComputedRef<T>}

export function useFieldActionMode(options: UseFieldActionModeOptions): UseFieldActionModeReturn {
  const actionMode = computed<FieldActionMode>(() => (options.isEditable.value ? 'editable' : 'readonly'))

  function chooseByMode<T>(editableValue: T, readonlyValue: T): ComputedRef<T> {
    return computed(() => (actionMode.value === 'editable' ? editableValue : readonlyValue))
  }

  return {
    actionMode,
    chooseByMode,
  }
}