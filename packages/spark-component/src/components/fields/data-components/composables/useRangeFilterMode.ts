import { computed } from 'vue'
import type { SparkRangeFilterProps } from '../../../shared-types.js'

export function useRangeFilterMode(props: SparkRangeFilterProps) {
  return computed(() => (
    props.filterMode === 'range'
    || props.filterVariant === 'range'
    || props.filterRange === true
  ))
}