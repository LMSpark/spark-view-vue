import type { SparkNode } from '../internal'

/**
 * `r-footer` 结构化配置属性。
 *
 * 由 dialog、drawer 等容器读取，用于决定底部区域宽度与样式。
 */
export interface RendererFooterConfigProps extends Record<string, unknown> {
  /** 底部区域附加 class。 */
  class?: string
  /** 底部区域宽度。 */
  width?: string | number
}

/**
 * `r-footer` 结构化节点。
 *
 * 作为 dock 型子节点挂在容器下，由绑定层提升为容器的 `footer` 属性。
 */
export interface FooterNode extends SparkNode {
  /** 节点类型固定为 `r-footer`。 */
  type: 'r-footer'
  /** 底部区域结构化配置。 */
  props?: RendererFooterConfigProps
  /** 底部内容节点列表。 */
  children?: SparkNode[]
}

/**
 * `RendererFooter` 运行时公开属性。
 *
 * 既可由 `r-footer` 结构节点投影而来，也可由容器显式传入。
 */
export interface RendererFooterProps {
  /** 组件类型固定为 `r-footer`。 */
  type?: 'r-footer'
  /** 节点标识。 */
  id?: string
  /** 底部内容节点列表。 */
  children?: SparkNode[]
  /** 页脚宽度 */
  width?: string | number
}
