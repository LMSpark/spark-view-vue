import type { SparkFieldProps } from '../../shared-types'

export type MultiValue = Array<string | number | boolean>

export interface RMultiSelectProps extends SparkFieldProps {
  width?: number
  modelValue?: MultiValue
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  clearable?: boolean
  filterable?: boolean
  collapseTags?: boolean
  collapseTagsTooltip?: boolean
  maxCollapseTags?: number
}
