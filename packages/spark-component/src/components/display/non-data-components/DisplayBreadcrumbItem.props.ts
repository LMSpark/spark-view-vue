import type { SparkComponentBaseProps } from '../../shared-types'

export interface RBreadcrumbItemProps extends SparkComponentBaseProps<'r-breadcrumb-item'> {
  /** 面包屑文本 */
  label?: string
  /** 跳转目标（路径或路由对象） */
  to?: string | object
  /** 是否替换当前历史记录 */
  replace?: boolean
}
