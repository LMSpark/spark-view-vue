import type { SparkFieldProps } from '../../shared-types'

export interface RSwitchProps extends SparkFieldProps<'r-switch'> {
  width?: number
  modelValue?: boolean | null
  activeText?: string
  inactiveText?: string
}
