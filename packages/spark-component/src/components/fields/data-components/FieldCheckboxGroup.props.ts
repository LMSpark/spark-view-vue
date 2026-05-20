import type { SparkButtonOptionFieldProps, SparkNodeProps } from '../../shared-types'

export type CheckboxGroupMultiValue = Array<string | number | boolean>

export interface RCheckboxGroupProps extends SparkNodeProps, SparkButtonOptionFieldProps<CheckboxGroupMultiValue> {}
