import type { SparkNode } from '../../internal'
import type { TailNode } from '../RendererTail.types'
import type { ToolbarPosition } from '../layout/useContainerToolbar'

export type InlineAlign = 'start' | 'center' | 'end' | 'stretch'
export type InlineJustify = 'start' | 'center' | 'end' | 'space-between'

export interface RendererToolbarConfigProps extends Record<string, unknown> {
	position?: ToolbarPosition
	class?: string
	gap?: number | string
	zoneGap?: number | string
	align?: InlineAlign
	justify?: InlineJustify
	tail?: TailNode
}

export type ToolbarNode = SparkNode & {
	type: 'r-toolbar'
	props?: RendererToolbarConfigProps
	children?: SparkNode[]
}

export interface RendererToolbarProps {
	type?: 'r-toolbar'
	children?: SparkNode[]
	tail?: TailNode
	gap?: number | string
	zoneGap?: number | string
	align?: InlineAlign
	justify?: InlineJustify
}
