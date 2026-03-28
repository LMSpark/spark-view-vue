import { computed } from 'vue'

interface RangeFilterProps {
  filterMode?: string | undefined
  filterVariant?: string | undefined
  filterRange?: boolean | undefined
}

export function useRangeFilterMode(props: RangeFilterProps) {
  return computed(() => (
    props.filterMode === 'range'
    || props.filterVariant === 'range'
    || props.filterRange === true
  ))
}