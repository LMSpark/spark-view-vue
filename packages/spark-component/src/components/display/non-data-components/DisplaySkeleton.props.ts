/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplaySkeleton.props
 * DisplaySkeleton 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RSkeletonProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RSkeleton Props 的属性契约。 */
export type RSkeletonProps = SparkNodeProps & {
  /** 骨架屏段落行数 */
    rows?: number
    /** 渲染骨架屏的重复次数 */
    count?: number
    /** 是否处于加载状态 */
    loading?: boolean
    /** 是否启用动画效果 */
    animated?: boolean
    /** 节流延迟（毫秒），低于该时长不显示骨架屏 */
    throttle?: number}
