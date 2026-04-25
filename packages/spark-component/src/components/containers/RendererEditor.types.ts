import type { SparkNode } from '../internal'
import type { ToolbarPosition } from './layout/useContainerToolbar'

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
 * `r-editor` 结构化节点。
 *
 * 作为结构化子节点挂在树等容器下，容器可通过 `editor` 配置读取。
 */
export interface EditorNode extends SparkNode {
  /** 节点类型固定为 `r-editor`。 */
  type: 'r-editor'
  /** 编辑区结构化配置。 */
  props?: RendererEditorConfigProps
  /** 编辑区内容节点列表。 */
  children?: SparkNode[]
}

/**
 * `RendererEditor` 运行时公开属性。
 *
 * 既可由 `r-editor` 结构节点投影而来，也可由容器显式传入。
 */
export interface RendererEditorProps {
  /** 组件类型固定为 `r-editor`。 */
  type?: 'r-editor'
  /** 节点标识。 */
  id?: string
  /** 编辑区内容节点列表。 */
  children?: SparkNode[]
  /** 工具栏位置 */
  position?: ToolbarPosition
  /** 编辑器宽度 */
  width?: string | number
}
