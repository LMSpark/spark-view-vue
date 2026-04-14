import type { SparkFieldProps } from '../../shared-types'

export type FetchSuggestionsCallback = (suggestions: Array<Record<string, unknown>>) => void

export interface RAutocompleteProps extends SparkFieldProps {
  value?: string
  fetchSuggestions?: (queryString: string, cb: FetchSuggestionsCallback) => void
  triggerOnFocus?: boolean
  highlightFirstItem?: boolean
  valueKey?: string
}
