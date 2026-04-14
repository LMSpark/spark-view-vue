import type { SparkFieldProps } from '../../shared-types'

export interface RNumberProps extends SparkFieldProps {
  width?: number
  modelValue?: number | [number | undefined, number | undefined]
  min?: number
  max?: number
  precision?: number
  filterMode?: string
  filterVariant?: string
  filterRange?: boolean
}
