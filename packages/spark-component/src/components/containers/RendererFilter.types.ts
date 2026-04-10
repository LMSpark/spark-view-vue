import type { FilterItemConfig } from '../../core/types.js'
import type { SparkNode } from '../internal'

export interface RendererFilterConfigProps extends Record<string, unknown> {
  class?: string
  columns?: Array<string | FilterItemConfig>
  collapsible?: boolean
  defaultCollapsed?: boolean
  autoFitMinWidth?: string
  itemSpan?: number
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

export type FilterNode = SparkNode & {
  type: 'r-filter'
  props?: RendererFilterConfigProps
  children?: SparkNode[]
}

export interface RendererFilterProps {
  type?: 'r-filter'
  id?: string
  children?: SparkNode[]
  columns?: Array<string | FilterItemConfig>
  collapsible?: boolean
  defaultCollapsed?: boolean
  autoFitMinWidth?: string
  itemSpan?: number
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}
