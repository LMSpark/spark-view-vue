import type { SparkNode } from '../internal'
import type { SparkNodeProps } from '../shared-types'

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
 * `RendererFooter` 运行时公开属性。
 */
export interface RendererFooterProps extends SparkNodeProps {
  /** 组件类型固定为 `r-footer`。 */
  type?: 'r-footer'
  /** 节点标识。 */
  id?: string
  /** 底部内容节点列表。 */
  children?: SparkNode[]
  /** 底部区域附加 class */
  class?: string
  /** 底部区域宽度 */
  width?: string | number
}
