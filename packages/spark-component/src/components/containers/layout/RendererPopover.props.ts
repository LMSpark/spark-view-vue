import type {
  SparkFloatingLayerProps,
  SparkNodeProps,
  SparkTitleContentProps,
} from '../../shared-types'
import type { SparkNode } from '../../internal'

export interface RPopoverProps extends SparkNodeProps, SparkFloatingLayerProps, SparkTitleContentProps {
  /** 浮层正文节点列表。 */
    contentChildren?: SparkNode[]
    /** 浮层宽度。 */
    width?: number | string
    /** 浮层触发方式。 */
    trigger?: 'click' | 'hover' | 'focus' | 'contextmenu'
}
