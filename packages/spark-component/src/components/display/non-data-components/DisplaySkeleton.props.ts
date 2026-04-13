import type { SparkChildrenProps } from '../../shared-types'

export interface RSkeletonProps extends SparkChildrenProps<'r-skeleton'> {
rows?: number
  count?: number
  loading?: boolean
  animated?: boolean
  throttle?: number
}
