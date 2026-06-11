/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayTimelineItem.props
 * DisplayTimelineItem 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RTimelineItemProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RTimeline Item Props 的属性契约。 */
export type RTimelineItemProps = SparkNodeProps & {
  /** 时间戳文本 */
    timestamp?: string
    /** 是否隐藏时间戳 */
    hideTimestamp?: boolean
    /** 是否垂直居中 */
    center?: boolean
    /** 时间戳位置 */
    placement?: 'top' | 'bottom'
    /** 节点类型 */
    itemType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    /** 节点颜色 */
    color?: string
    /** 节点尺寸 */
    itemSize?: 'normal' | 'large'
    /** 是否空心节点 */
    hollow?: boolean
    /** 内容文本 */
    content?: string}
