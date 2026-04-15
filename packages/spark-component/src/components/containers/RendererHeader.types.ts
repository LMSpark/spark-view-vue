import type { SparkNode } from '../internal'

/**
 * `r-header` 结构化配置属性。
 *
 * 由 dialog、drawer、section 等容器读取，用于决定头部区域宽度与样式。
 */
export interface RendererHeaderConfigProps extends Record<string, unknown> {
  /** 头部区域附加 class。 */
  class?: string
  /** 头部区域宽度。 */
  width?: string | number
}

/**
 * `r-header` 结构化节点。
 *
 * 作为 dock 型子节点挂在容器下，由绑定层提升为容器的 `header` 属性。
 */
export interface HeaderNode extends SparkNode {
  /** 节点类型固定为 `r-header`。 */
  type: 'r-header'
  /** 头部区域结构化配置。 */
  props?: RendererHeaderConfigProps
  /** 头部内容节点列表。 */
  children?: SparkNode[]
}

/**
 * `RendererHeader` 运行时公开属性。
 *
 * 既可由 `r-header` 结构节点投影而来，也可由容器显式传入。
 */
export interface RendererHeaderProps {
  /** 组件类型固定为 `r-header`。 */
  type?: 'r-header'
  /** 节点标识。 */
  id?: string
  /** 头部内容节点列表。 */
  children?: SparkNode[]
  /** 页头宽度 */
  width?: string | number
}
