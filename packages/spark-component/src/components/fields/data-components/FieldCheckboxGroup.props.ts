import type { SparkOptionButtonStyleProps, SparkOptionFieldProps } from '../../shared-types'

export type CheckboxGroupMultiValue = Array<string | number | boolean>

export interface RCheckboxGroupProps extends SparkOptionFieldProps, SparkOptionButtonStyleProps {
  value?: CheckboxGroupMultiValue
}
