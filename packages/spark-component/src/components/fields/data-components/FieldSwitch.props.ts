import type { SparkFieldProps } from '../../shared-types'

export interface RSwitchProps extends SparkFieldProps {
  width?: number
  modelValue?: boolean | null
  activeText?: string
  inactiveText?: string
}
