/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererAnchor.props
 * RendererAnchor 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RAnchorProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RAnchor Props 的属性契约。 */
export type RAnchorProps = SparkNodeProps & {
  /** 滚动容器选择器 */
    container?: string
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
    anchorType?: 'default' | 'underline'}
