import type { SparkButtonOptionFieldProps, SparkNodeProps } from '../../shared-types'

export interface CheckboxGroupMultiValue extends Array<string | number | boolean> {}

export interface RCheckboxGroupProps extends SparkNodeProps, SparkButtonOptionFieldProps<CheckboxGroupMultiValue> {}
