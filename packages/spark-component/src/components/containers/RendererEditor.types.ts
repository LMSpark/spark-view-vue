import type { SparkNode } from '../internal'
import type { ToolbarPosition } from './layout/useContainerToolbar'

export interface RendererEditorConfigProps extends Record<string, unknown> {
  position?: ToolbarPosition
  width?: string | number
  class?: string
}

export type EditorNode = SparkNode & {
  type: 'r-editor'
  props?: RendererEditorConfigProps
  children?: SparkNode[]
}

export interface RendererEditorProps {
  type?: 'r-editor'
  id?: string
  children?: SparkNode[]
  position?: ToolbarPosition
  width?: string | number
}
