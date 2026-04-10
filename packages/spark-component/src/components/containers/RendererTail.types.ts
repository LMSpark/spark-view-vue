import type { SparkNode } from '../internal'

export interface RendererTailConfigProps extends Record<string, unknown> {
  class?: string
  width?: string | number
}

export type TailNode = SparkNode & {
  type: 'r-tail'
  props?: RendererTailConfigProps
  children?: SparkNode[]
}

export interface RendererTailProps {
  type?: 'r-tail'
  id?: string
  children?: SparkNode[]
  class?: string
  width?: string | number
}
