import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

export type FetchSuggestionsCallback = (suggestions: Array<Record<string, unknown>>) => void

export type RAutocompleteProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 弹出建议面板前是否先基于当前焦点触发一次拉取。 */
  fetchSuggestions?: (queryString: SparkText, cb: FetchSuggestionsCallback) => void
  /** 获得焦点时是否立即触发建议查询。 */
  triggerOnFocus?: boolean
  /** 是否默认高亮第一条候选项。 */
  highlightFirstItem?: boolean
  /** 建议项中作为展示值的字段名。 */
  valueKey?: SparkText
}
