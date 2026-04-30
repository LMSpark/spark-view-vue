import type { SparkNode } from '../internal'
import type { SparkNodeProps } from '../shared-types'
import type { ToolbarPosition } from './layout'

/**
 * `r-editor` 结构化配置属性。
 *
 * 由树等容器读取，用于决定编辑区停靠位置、宽度与样式。
 */
export interface RendererEditorConfigProps extends Record<string, unknown> {
  /** 编辑区停靠位置。 */
  position?: ToolbarPosition
  /** 编辑区宽度。 */
  width?: string | number
  /** 编辑区附加 class。 */
  class?: string
}

/**
 * `RendererEditor` 运行时公开属性。
 */
export interface RendererEditorProps extends SparkNodeProps {
  /** 组件类型固定为 `r-editor`。 */
  type?: 'r-editor'
  /** 节点标识。 */
  id?: string
  /** 编辑区内容节点列表。 */
  children?: SparkNode[]
  /** 编辑区停靠位置 */
  position?: ToolbarPosition
  /** 编辑区宽度 */
  width?: string | number
  /** 编辑区附加 class */
  class?: string
}
