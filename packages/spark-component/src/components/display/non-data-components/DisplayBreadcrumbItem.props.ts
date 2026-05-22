import type { SparkNodeProps } from '../../shared-types'

export type RBreadcrumbItemProps = SparkNodeProps & {
  /** 面包屑文本 */
    label?: string
    /** 跳转目标（路径或路由对象） */
    to?: string | object
    /** 是否替换当前历史记录 */
    replace?: boolean}
