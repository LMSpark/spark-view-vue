import type { SparkComponentBaseProps } from '../../shared-types'

export interface RPaginationProps extends SparkComponentBaseProps<'r-pagination'> {
total?: number
  pageSize?: number
  currentPage?: number
  pageSizes?: number[]
  pagerCount?: number
  layout?: string
  background?: boolean
  small?: boolean
  hideOnSinglePage?: boolean
}
