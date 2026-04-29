import type { SparkDataContainerProps, SparkNodeProps } from '../../shared-types'
import type { TailNode } from '../RendererTail.types'
import type { InlineAlign, InlineJustify } from './RendererToolbar.types'

export type { InlineAlign, InlineJustify }

export interface RToolbarProps extends SparkNodeProps, SparkDataContainerProps {
  /** 尾部动作区（通常放次要按钮） @componentRef r-tail */
  tail?: TailNode
  /** 主区内元素间距 */
  gap?: number | string
  /** 主区与尾区间距 */
  zoneGap?: number | string
  /** 交叉轴对齐 */
  align?: InlineAlign
  /** 主轴分布 */
  justify?: InlineJustify
}
