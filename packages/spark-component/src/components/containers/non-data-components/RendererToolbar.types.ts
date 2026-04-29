import type { SparkNode } from '../../internal'
import type { SparkDataContainerProps, SparkNodeProps } from '../../shared-types'
import type { TailNode } from '../RendererTail.types'
import type { ToolbarPosition } from '../layout/toolbar-position'

/** 工具栏交叉轴对齐方式。 */
export type InlineAlign = 'start' | 'center' | 'end' | 'stretch'

/** 工具栏主轴分布方式。 */
export type InlineJustify = 'start' | 'center' | 'end' | 'space-between'

/**
 * `r-toolbar` 结构化节点。
 */
export interface ToolbarNode extends SparkNode {
	/** 节点类型固定为 `r-toolbar`。 */
	type: 'r-toolbar'
	/** 宿主容器读取的属性（不得添加已在 RToolbarProps 里的重复字段）。 */
	props?: { position?: ToolbarPosition; class?: string } & Record<string, unknown>
	/** 工具栏动作节点列表。 */
	children?: SparkNode[]
}

/**
 * `RendererToolbar` Vue 组件公开属性。
 */
export interface RToolbarProps extends SparkNodeProps, SparkDataContainerProps {
  /** 尾部动作区（通常放次要按鈕） @componentRef r-tail */
  tail?: TailNode
  /** 主区内元素间距 */
  gap?: number | string
  /** 主区与尾区间距 */
  zoneGap?: number | string
  /** 交叉轴对齐 */
  align?: InlineAlign
  /** 主轴分布 */
  justify?: InlineJustify
}
