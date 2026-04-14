import type { SparkFieldProps } from '../../shared-types'

export interface RSwitchProps extends SparkFieldProps {
  value?: boolean | null
  activeText?: string
  inactiveText?: string
}
