import type { SparkHierarchicalSelectionProps, SparkOptionFieldProps } from '../../shared-types'

export type CascaderPath = Array<string | number | boolean>
export type CascaderValue = CascaderPath | CascaderPath[]

export interface RCascaderProps extends SparkOptionFieldProps, SparkHierarchicalSelectionProps {
  value?: CascaderValue
  emitPath?: boolean
}
