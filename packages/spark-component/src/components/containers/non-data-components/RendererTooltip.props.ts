import type { SparkFloatingLayerContainerProps, SparkNodeProps } from '../../shared-types'

export interface RTooltipProps extends SparkNodeProps, SparkFloatingLayerContainerProps {
  /** 提示内容文本。 */
  content?: string
  /** 鼠标移入浮层内容时是否保持展开。 */
  enterable?: boolean
  /** 是否按原始 HTML 内容渲染。 */
  rawContent?: boolean
}
