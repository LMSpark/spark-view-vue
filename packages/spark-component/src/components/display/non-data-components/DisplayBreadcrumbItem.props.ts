/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayBreadcrumbItem.props
 * DisplayBreadcrumbItem 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RBreadcrumbItemProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RBreadcrumb Item Props 的属性契约。 */
export type RBreadcrumbItemProps = SparkNodeProps & {
  /** 面包屑文本 */
    label?: string
    /** 跳转目标（路径或路由对象） */
    to?: string | object
    /** 是否替换当前历史记录 */
    replace?: boolean}
