import type { SparkNode } from '../internal'

export interface RendererHeaderConfigProps extends Record<string, unknown> {
  class?: string
  width?: string | number
}

export type HeaderNode = SparkNode & {
  type: 'r-header'
  props?: RendererHeaderConfigProps
  children?: SparkNode[]
}

export interface RendererHeaderProps {
  type?: 'r-header'
  id?: string
  children?: SparkNode[]
  width?: string | number
}
