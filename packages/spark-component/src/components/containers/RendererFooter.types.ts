import type { SparkNode } from '../internal'

export interface RendererFooterConfigProps extends Record<string, unknown> {
  class?: string
  width?: string | number
}

export type FooterNode = SparkNode & {
  type: 'r-footer'
  props?: RendererFooterConfigProps
  children?: SparkNode[]
}

export interface RendererFooterProps {
  type?: 'r-footer'
  id?: string
  children?: SparkNode[]
  width?: string | number
}
