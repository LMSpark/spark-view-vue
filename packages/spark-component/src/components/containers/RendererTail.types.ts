import type { SparkNode } from '../internal'
import type { SparkNodeProps } from '../shared-types'

/**
 * `r-tail` 结构化配置属性。
 *
 * 由工具栏等容器读取，用于决定尾部区域宽度与样式。
 */
export interface RendererTailConfigProps extends Record<string, unknown> {
  /** 尾部区域附加 class。 */
  class?: string
  /** 尾部区域宽度。 */
  width?: string | number
}

/**
 * `RendererTail` 运行时公开属性。
 */
export interface RendererTailProps extends SparkNodeProps {
  /** 组件类型固定为 `r-tail`。 */
  type?: 'r-tail'
  /** 节点标识。 */
  id?: string
  /** 尾部内容节点列表。 */
  children?: SparkNode[]
  /** 尾部区域附加 class。 */
  class?: string
  /** 尾部区域宽度 */
  width?: string | number
}
