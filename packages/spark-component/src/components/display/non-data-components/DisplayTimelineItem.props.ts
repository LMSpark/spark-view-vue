import type { SparkNodeProps } from '../../shared-types'

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
