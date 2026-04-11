import type { SparkNode } from '../../internal'

export type ActionsAlign = 'left' | 'center' | 'right'
export type ActionsPosition = 'left' | 'right'

export interface RendererActionsConfigProps extends Record<string, unknown> {
  position?: ActionsPosition
  label?: string
  width?: string | number
  align?: ActionsAlign
  fixed?: boolean | ActionsPosition
  class?: string
}

export type ActionsNode = SparkNode & {
  type: 'r-actions'
  props?: RendererActionsConfigProps
  children?: SparkNode[]
}
