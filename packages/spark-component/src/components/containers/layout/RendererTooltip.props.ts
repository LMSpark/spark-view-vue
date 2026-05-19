import type { SparkFloatingLayerProps, SparkNodeProps } from '../../shared-types'

export interface RTooltipProps extends SparkNodeProps, SparkFloatingLayerProps {
  /** 提示内容文本。 */
  content?: SparkText
  /** 鼠标移入浮层内容时是否保持展开。 */
  enterable?: boolean
  /** 是否按原始 HTML 内容渲染。 */
  rawContent?: boolean
}
