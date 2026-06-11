/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererAnchorLink.props
 * RendererAnchorLink 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RAnchorLinkProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RAnchor Link Props 的属性契约。 */
export type RAnchorLinkProps = SparkNodeProps & {
  /** 锚点链接 */
    href?: string
    /** 链接标题 */
    title?: string}
