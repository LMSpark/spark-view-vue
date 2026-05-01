import type { SparkNode } from '../internal'
import type { SparkNodeProps } from '../shared-types'
import type { ToolbarPosition } from './composables/container-composables'

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
