import type { SparkFieldProps } from '../../shared-types'

export type CascaderPath = Array<string | number | boolean>
export type CascaderValue = CascaderPath | CascaderPath[]

export interface RCascaderProps extends SparkFieldProps<'r-cascader'> {
  width?: number
  modelValue?: CascaderValue
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
  clearable?: boolean
  filterable?: boolean
  multiple?: boolean
  checkStrictly?: boolean
  emitPath?: boolean
}
