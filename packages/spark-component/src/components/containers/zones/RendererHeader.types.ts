/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererHeader.types
 * RendererHeader 模块，属于 SPARK component container/zone-container。
 * 组件目录: containers/zones。
 * 导出 ClassModel symbol: RHeaderProps（共 1 个 symbol）。
 */
import type { SparkNode } from '../../internal'
import type { SparkNodeProps } from '../../shared-types'

/**
 * `RendererHeader` 运行时公开属性。
 */
export type RHeaderProps = SparkNodeProps & {
  /** 组件类型固定为 `r-header`。 */
    type?: 'r-header'
    /** 节点标识。 */
    id?: string
    /** 头部内容节点列表。 */
    children?: SparkNode[]
    /** 头部区域附加 class */
    class?: string
    /** 头部区域宽度 */
    width?: string | number}
