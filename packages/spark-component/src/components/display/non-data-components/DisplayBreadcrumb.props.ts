/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayBreadcrumb.props
 * DisplayBreadcrumb 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RBreadcrumbProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RBreadcrumb Props 的属性契约。 */
export type RBreadcrumbProps = SparkNodeProps & {
  /** 分隔符文本，例如 `/` 或 `>` */
    separator?: string
    /** 分隔符图标名，优先级高于 separator 文本 */
    separatorIcon?: string}
