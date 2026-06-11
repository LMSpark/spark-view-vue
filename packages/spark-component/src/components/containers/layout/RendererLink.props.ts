/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererLink.props
 * RendererLink 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RLinkProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RLink Props 的属性契约。 */
export type RLinkProps = SparkNodeProps & {
  /** 链接文本 */
    label?: string
    /** 链接类型 */
    linkType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
    /** 是否显示下划线 */
    underline?: boolean
    /** 跳转地址 */
    href?: string
    /** 跳转目标 */
    target?: '_blank' | '_self' | '_parent' | '_top'}
