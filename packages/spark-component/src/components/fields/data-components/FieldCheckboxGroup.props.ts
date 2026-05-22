import type { SparkButtonOptionFieldProps, SparkNodeProps } from '../../shared-types'

export type CheckboxGroupMultiValue = Array<string | number | boolean>

export type RCheckboxGroupProps = SparkNodeProps & SparkButtonOptionFieldProps<CheckboxGroupMultiValue>
