import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** 多选字段值数组；每一项是最终写入业务字段的候选值。 */
export type MultiValue = Array<string | number | boolean>

export type RMultiSelectProps = SparkNodeProps & SparkOptionFieldProps<MultiValue> & {
  /** 选中项较多时是否折叠标签。 */
  collapseTags?: boolean
  /** 折叠标签时是否在悬停中展示完整内容。 */
  collapseTagsTooltip?: boolean
  /** 折叠后最多显示的标签数量。 */
  maxCollapseTags?: number
}
