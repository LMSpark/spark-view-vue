import type { SparkFieldProps } from '../../shared-types'

export type FetchSuggestionsCallback = (suggestions: Array<Record<string, unknown>>) => void

export interface RAutocompleteProps extends SparkFieldProps {
  width?: number
  modelValue?: string
  fetchSuggestions?: (queryString: string, cb: FetchSuggestionsCallback) => void
  triggerOnFocus?: boolean
  highlightFirstItem?: boolean
  clearable?: boolean
  valueKey?: string
}
