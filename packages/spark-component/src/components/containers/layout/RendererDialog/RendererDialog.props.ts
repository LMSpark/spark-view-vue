/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererDialog/RendererDialog.props
 * RendererDialog 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RDialogProps（共 1 个 symbol）。
 */
import type {
  SparkGridLayoutProps,
  SparkNodeProps,
  SparkVisibilityContainerProps,
} from '../../../shared-types'
import type { RFooterProps } from '../../zones/RendererFooter.types'
import type { RHeaderProps } from '../../zones/RendererHeader.types'

/** RDialog Props 的属性契约。 */
export type RDialogProps = SparkNodeProps & SparkVisibilityContainerProps & SparkGridLayoutProps & {
  /** 结构化头部 */
    header?: RHeaderProps
    /** 结构化底部 */
    footer?: RFooterProps
    /** 对话框标题 */
    title?: string
    /** 控制显隐 */
    modelValue?: boolean
    /** 内容区 CSS 类名 */
    bodyClass?: string}
