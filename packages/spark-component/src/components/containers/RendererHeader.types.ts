import type { SparkNode } from '../internal'
import type { SparkNodeProps } from '../shared-types'

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
 * `RendererHeader` 运行时公开属性。
 */
export interface RendererHeaderProps extends SparkNodeProps {
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
