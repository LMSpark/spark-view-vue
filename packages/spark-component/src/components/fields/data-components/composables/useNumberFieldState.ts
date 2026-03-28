import { computed } from 'vue'

interface ValueRef<T> {
  value: T
}

type NumberFieldValue = number | [number | undefined, number | undefined]

interface UseNumberFieldStateOptions {
  fieldValue: ValueRef<NumberFieldValue>
  emitUpdate: (value: NumberFieldValue) => void
  syncValue: (value: NumberFieldValue) => void
}

export function useNumberFieldState(options: UseNumberFieldStateOptions) {
  const rangeStart = computed(() => Array.isArray(options.fieldValue.value) ? options.fieldValue.value[0] : undefined)
  const rangeEnd = computed(() => Array.isArray(options.fieldValue.value) ? options.fieldValue.value[1] : undefined)

  function updateValue(value: NumberFieldValue): void {
    options.emitUpdate(value)
    options.syncValue(value)
  }

  function handleChange(value: number): void {
    updateValue(value)
  }

  function handleRangeStartChange(value: number | undefined): void {
    updateValue([value, rangeEnd.value])
  }

  function handleRangeEndChange(value: number | undefined): void {
    updateValue([rangeStart.value, value])
  }

  return {
    rangeStart,
    rangeEnd,
    handleChange,
    handleRangeStartChange,
    handleRangeEndChange,
  }
}