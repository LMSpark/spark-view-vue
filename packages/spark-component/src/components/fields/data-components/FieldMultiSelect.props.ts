import type { SparkOptionFieldProps } from '../../shared-types'

export type MultiValue = Array<string | number | boolean>

export interface RMultiSelectProps extends SparkOptionFieldProps {
  value?: MultiValue
  collapseTags?: boolean
  collapseTagsTooltip?: boolean
  maxCollapseTags?: number
}
