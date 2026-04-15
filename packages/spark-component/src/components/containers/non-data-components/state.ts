import { shallowRef, watch, type ShallowRef } from 'vue'
import type { ValueRef } from '../../shared-types.js'

export function useMirroredValue<T>(source: ValueRef<T>): ShallowRef<T> {
  const state = shallowRef<T>(source.value)
  watch(() => source.value, value => {
    state.value = value
  }, { immediate: true })
  return state
}

export function useDefaultedSelection<TItem, TValue>(options: {
  value: ValueRef<TValue | undefined>
  items: ValueRef<TItem[]>
  getValue: (item: TItem, index: number) => TValue
}): ShallowRef<TValue | undefined> {
  const state = shallowRef<TValue | undefined>(options.value.value)

  watch(() => options.value.value, value => {
    state.value = value
  }, { immediate: true })

  watch(() => options.items.value, items => {
    if (state.value !== undefined) return
    if (items.length === 0) return
    const firstItem = items[0] as TItem
    state.value = options.getValue(firstItem, 0)
  }, { immediate: true })

  return state
}