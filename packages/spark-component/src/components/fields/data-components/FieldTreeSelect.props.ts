import type { SparkFieldProps } from '../../shared-types'

export type TreeSelectPrimitive = string | number | boolean
export type TreeSelectValue = TreeSelectPrimitive | TreeSelectPrimitive[]

export interface RTreeSelectProps extends SparkFieldProps {
  width?: number
  modelValue?: TreeSelectValue
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
  clearable?: boolean
  filterable?: boolean
  multiple?: boolean
  checkStrictly?: boolean
  defaultExpandAll?: boolean
  renderAfterExpand?: boolean
}
