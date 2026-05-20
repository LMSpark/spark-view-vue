import type { SparkNode } from '../../internal'
import type { SparkNodeProps } from '../../shared-types'

/**
 * `RendererHeader` 运行时公开属性。
 */
export interface RHeaderProps extends SparkNodeProps {
  /** 组件类型固定为 `r-header`。 */
    type?: 'r-header'
    /** 节点标识。 */
    id?: string
    /** 头部内容节点列表。 */
    children?: SparkNode[]
    /** 头部区域附加 class */
    class?: string
    /** 头部区域宽度 */
    width?: string | number
}
