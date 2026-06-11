/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererCard.props
 * RendererCard 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RCardProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RCard Props 的属性契约。 */
export type RCardProps = SparkNodeProps & {
  /** 卡片头部文本 */
    header?: string
    /** 阴影显示策略 */
    shadow?: 'always' | 'hover' | 'never'
    /** 卡片主体样式 */
    bodyStyle?: Record<string, unknown> | string
    /** 卡片主体 class */
    bodyClass?: string}
