import type { SparkChildrenProps } from '../../shared-types'
import type { TailNode } from '../RendererTail.types'
import type { InlineAlign, InlineJustify } from './RendererToolbar.types'

export type { InlineAlign, InlineJustify }

export interface RToolbarProps extends SparkChildrenProps<'r-toolbar'> {
  tail?: TailNode
  gap?: number | string
  zoneGap?: number | string
  align?: InlineAlign
  justify?: InlineJustify
}
