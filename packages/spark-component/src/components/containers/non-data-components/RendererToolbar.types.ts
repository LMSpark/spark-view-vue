import type { SparkNode } from '../../internal'
import type { TailNode } from '../RendererTail.types'
import type { ToolbarPosition } from '../layout/useContainerToolbar'

/** 工具栏交叉轴对齐方式。 */
export type InlineAlign = 'start' | 'center' | 'end' | 'stretch'

/** 工具栏主轴分布方式。 */
export type InlineJustify = 'start' | 'center' | 'end' | 'space-between'

/**
 * `r-toolbar` 结构化配置属性。
 *
 * 由列表、表格、树等容器读取，用于决定工具栏位置、间距、对齐与尾部区域。
 */
export interface RendererToolbarConfigProps extends Record<string, unknown> {
	/** 工具栏 DOM 标识。 */
	id?: string
	/** 工具栏停靠位置。 */
	position?: ToolbarPosition
	/** 工具栏附加 class。 */
	class?: string
	/** 主区内元素间距。 */
	gap?: number | string
	/** 主区与尾区间距。 */
	zoneGap?: number | string
	/** 工具栏交叉轴对齐方式。 */
	align?: InlineAlign
	/** 工具栏主轴分布方式。 */
	justify?: InlineJustify
	/** 尾部动作区 @componentRef r-tail */
	tail?: TailNode
}

/**
 * `r-toolbar` 结构化节点。
 *
 * 作为结构化子节点挂在容器下，容器可通过 `toolbar` 配置读取。
 */
export interface ToolbarNode extends SparkNode {
	/** 节点类型固定为 `r-toolbar`。 */
	type: 'r-toolbar'
	/** 工具栏结构化配置。 */
	props?: RendererToolbarConfigProps
	/** 工具栏动作节点列表。 */
	children?: SparkNode[]
}

/**
 * `RendererToolbar` 运行时公开属性。
 *
 * 既可由 `r-toolbar` 结构节点投影而来，也可由宿主组件显式传入。
 */
export interface RendererToolbarProps {
	/** 组件类型固定为 `r-toolbar`。 */
	type?: 'r-toolbar'
	/** 工具栏 DOM 标识。 */
	id?: string
	/** 工具栏动作节点列表。 */
	children?: SparkNode[]
	/** 尾部动作区 @componentRef r-tail */
	tail?: TailNode
	/** 主区内元素间距。 */
	gap?: number | string
	/** 主区与尾区间距。 */
	zoneGap?: number | string
	/** 工具栏交叉轴对齐方式。 */
	align?: InlineAlign
	/** 工具栏主轴分布方式。 */
	justify?: InlineJustify
}
