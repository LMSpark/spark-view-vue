/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererPopover.props
 * RendererPopover 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RPopoverProps（共 1 个 symbol）。
 */
import type {
  SparkFloatingLayerProps,
  SparkNodeProps,
  SparkTitleContentProps,
} from '../../shared-types'
import type { SparkNode } from '../../internal'

/** RPopover Props 的属性契约。 */
export type RPopoverProps = SparkNodeProps & SparkFloatingLayerProps & SparkTitleContentProps & {
  /** 浮层正文节点列表。 */
    contentChildren?: SparkNode[]
    /** 浮层宽度。 */
    width?: number | string
    /** 浮层触发方式。 */
    trigger?: 'click' | 'hover' | 'focus' | 'contextmenu'}
