/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererDivider.props
 * RendererDivider 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RDividerProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RDivider Props 的属性契约。 */
export type RDividerProps = SparkNodeProps & {
  /** 分割方向 */
    direction?: 'horizontal' | 'vertical'
    /** 边框样式 */
    borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
    /** 文本位置（横向模式） */
    contentPosition?: 'left' | 'center' | 'right'
    /** 分割线文本 */
    content?: string}
