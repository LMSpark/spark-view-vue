/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldAutocomplete.props
 * FieldAutocomplete 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: FetchSuggestionsCallback, RAutocompleteProps（共 2 个 symbol）。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

/** Fetch Suggestions Callback 的语义模型。 */
export type FetchSuggestionsCallback = {
  (suggestions: Array<Record<string, unknown>>): void}

/** RAutocomplete Props 的属性契约。 */
export type RAutocompleteProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 弹出建议面板前是否先基于当前焦点触发一次拉取。 */
    fetchSuggestions?: (queryString: string, cb: FetchSuggestionsCallback) => void
    /** 获得焦点时是否立即触发建议查询。 */
    triggerOnFocus?: boolean
    /** 是否默认高亮第一条候选项。 */
    highlightFirstItem?: boolean
    /** 建议项中作为展示值的字段名。 */
    valueKey?: string}
