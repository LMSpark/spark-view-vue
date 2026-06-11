/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererTail.types
 * RendererTail 模块，属于 SPARK component container/zone-container。
 * 组件目录: containers/zones。
 * 导出 ClassModel symbol: RTailProps（共 1 个 symbol）。
 */
import type { SparkNode } from '../../internal'
import type { SparkNodeProps } from '../../shared-types'

/**
 * `RendererTail` 运行时公开属性。
 */
export type RTailProps = SparkNodeProps & {
  /** 组件类型固定为 `r-tail`。 */
    type?: 'r-tail'
    /** 节点标识。 */
    id?: string
    /** 尾部内容节点列表。 */
    children?: SparkNode[]
    /** 尾部区域附加 class。 */
    class?: string
    /** 尾部区域宽度 */
    width?: string | number}
