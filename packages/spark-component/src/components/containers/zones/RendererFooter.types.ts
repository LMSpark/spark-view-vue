/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererFooter.types
 * RendererFooter 模块，属于 SPARK component container/zone-container。
 * 组件目录: containers/zones。
 * 导出 ClassModel symbol: RFooterProps（共 1 个 symbol）。
 */
import type { SparkNode } from '../../internal'
import type { SparkNodeProps } from '../../shared-types'

/**
 * `RendererFooter` 运行时公开属性。
 */
export type RFooterProps = SparkNodeProps & {
  /** 组件类型固定为 `r-footer`。 */
    type?: 'r-footer'
    /** 节点标识。 */
    id?: string
    /** 底部内容节点列表。 */
    children?: SparkNode[]
    /** 底部区域附加 class */
    class?: string
    /** 底部区域宽度 */
    width?: string | number}
