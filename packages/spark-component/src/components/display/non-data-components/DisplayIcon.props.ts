/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayIcon.props
 * DisplayIcon 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RDisplayIconProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RDisplay Icon Props 的属性契约。 */
export type RDisplayIconProps = SparkNodeProps & {
  /** 图标名称（由项目图标注册表解析） */
    icon?: string
    /** 图标大小 */
    iconSize?: number | string
    /** 图标颜色 */
    color?: string}
