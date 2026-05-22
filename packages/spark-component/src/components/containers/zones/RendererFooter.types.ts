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
