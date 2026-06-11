/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererTooltip.props
 * RendererTooltip 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RTooltipProps（共 1 个 symbol）。
 */
import type { SparkFloatingLayerProps, SparkNodeProps } from '../../shared-types'

/** RTooltip Props 的属性契约。 */
export type RTooltipProps = SparkNodeProps & SparkFloatingLayerProps & {
  /** 提示内容文本。 */
    content?: string
    /** 鼠标移入浮层内容时是否保持展开。 */
    enterable?: boolean
    /** 是否按原始 HTML 内容渲染。 */
    rawContent?: boolean}
