import type { SparkNode } from '../internal'

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
 * `r-tail` 结构化节点。
 *
 * 作为结构化子节点挂在工具栏等容器下，容器可通过 `tail` 配置读取。
 */
export interface TailNode extends SparkNode {
  /** 节点类型固定为 `r-tail`。 */
  type: 'r-tail'
  /** 尾部区域结构化配置。 */
  props?: RendererTailConfigProps
  /** 尾部内容节点列表。 */
  children?: SparkNode[]
}

/**
 * `RendererTail` 运行时公开属性。
 *
 * 既可由 `r-tail` 结构节点投影而来，也可由宿主组件显式传入。
 */
export interface RendererTailProps {
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
