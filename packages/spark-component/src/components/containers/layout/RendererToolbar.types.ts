import type { SparkDataContainerProps, SparkNodeProps } from '../../shared-types'
import type { RendererTailProps } from '../page-frame/RendererTail.types'
import type { ToolbarPosition } from '../composables/container-ui'

/** 工具栏交叉轴对齐方式。 */
export type InlineAlign = 'start' | 'center' | 'end' | 'stretch'

/** 工具栏主轴分布方式。 */
export type InlineJustify = 'start' | 'center' | 'end' | 'space-between'

/**
 * `RendererToolbar` Vue 组件公开属性。
 */
export interface RToolbarProps extends SparkNodeProps, SparkDataContainerProps {
  /** 尾部动作区（通常放次要按钮） @componentRef r-tail */
  tail?: RendererTailProps
  /** 工具栏停靠位置 */
  position?: ToolbarPosition
  /** 工具栏附加 class */
  class?: string
  /** 主区内元素间距 */
  gap?: number | string
  /** 主区与尾区间距 */
  zoneGap?: number | string
  /** 交叉轴对齐 */
  align?: InlineAlign
  /** 主轴分布 */
  justify?: InlineJustify
}
