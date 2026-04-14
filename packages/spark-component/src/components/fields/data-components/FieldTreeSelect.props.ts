import type { SparkHierarchicalSelectionProps, SparkOptionFieldProps } from '../../shared-types'

export type TreeSelectPrimitive = string | number | boolean
export type TreeSelectValue = TreeSelectPrimitive | TreeSelectPrimitive[]

export interface RTreeSelectProps extends SparkOptionFieldProps, SparkHierarchicalSelectionProps {
  value?: TreeSelectValue
  defaultExpandAll?: boolean
  renderAfterExpand?: boolean
}
