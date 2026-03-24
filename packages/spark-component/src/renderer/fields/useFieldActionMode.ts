import { computed } from 'vue'
import type { ComputedRef } from 'vue'

export type FieldActionMode = 'editable' | 'readonly'

interface UseFieldActionModeOptions {
  isEditable: ComputedRef<boolean>
}

interface UseFieldActionModeReturn {
  actionMode: ComputedRef<FieldActionMode>
  chooseByMode: <T>(editableValue: T, readonlyValue: T) => ComputedRef<T>
}

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