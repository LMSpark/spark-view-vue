import type { SparkNodeProps } from '../../shared-types'

export interface RAnchorProps extends SparkNodeProps {
  /** 滚动容器选择器 */
  container?: SparkText
  /** 偏移量 */
  offset?: number
  /** 边界值 */
  bound?: number
  /** 滚动动画时长 */
  duration?: number
  /** 是否显示标记 */
  marker?: boolean
  /** 排列方向 */
  direction?: 'vertical' | 'horizontal'
  /** 锚点类型（避免与 SparkNode.type 冲突） */
  anchorType?: 'default' | 'underline'
}
