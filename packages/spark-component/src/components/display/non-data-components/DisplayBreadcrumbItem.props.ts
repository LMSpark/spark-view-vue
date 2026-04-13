import type { SparkComponentBaseProps } from '../../shared-types'

export interface RBreadcrumbItemProps extends SparkComponentBaseProps<'r-breadcrumb-item'> {
label?: string
  to?: string | object
  replace?: boolean
}
