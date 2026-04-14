import type { SparkFieldProps, SparkNumericBoundsProps, SparkRangeFilterProps } from '../../shared-types'

export interface RNumberProps extends SparkFieldProps, SparkRangeFilterProps, SparkNumericBoundsProps {
  value?: number | [number | undefined, number | undefined]
  precision?: number
}
