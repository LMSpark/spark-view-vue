import type { SparkNodeProps } from '../../shared-types'

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
