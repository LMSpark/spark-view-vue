import type { SparkNodeProps } from '../../shared-types'

export interface RSkeletonProps extends SparkNodeProps {
rows?: number
  count?: number
  loading?: boolean
  animated?: boolean
  throttle?: number
}
