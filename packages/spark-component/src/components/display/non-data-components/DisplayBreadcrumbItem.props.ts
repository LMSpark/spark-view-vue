import type { SparkNodeProps } from '../../shared-types'

export interface RBreadcrumbItemProps extends SparkNodeProps {
  /** 面包屑文本 */
  label?: SparkText
  /** 跳转目标（路径或路由对象） */
  to?: SparkText | object
  /** 是否替换当前历史记录 */
  replace?: boolean
}
