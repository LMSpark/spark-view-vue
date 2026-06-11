/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSpace.props
 * RendererSpace 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RSpaceProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RSpace Props 的属性契约。 */
export type RSpaceProps = SparkNodeProps & {
  /** 主轴方向 */
    direction?: 'horizontal' | 'vertical'
    /** 间距 */
    size?: number | string
    /** 是否自动换行 */
    wrap?: boolean
    /** 是否填充父容器 */
    fill?: boolean
    /** 交叉轴对齐方式 */
    alignment?: 'stretch' | 'center' | 'flex-start' | 'flex-end' | 'baseline'}
