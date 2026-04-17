import type { IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../../../internal'

/** 行片段内容对齐方式。 */
export type RowFragmentAlign = 'left' | 'center' | 'right'

/**
 * `r-row-fragment` 的公共宿主元属性。
 *
 * 这些属性先作为“行片段语义契约”沉淀下来，供不同集合宿主按需消费：
 * - table 可消费 title/label/width/minWidth/align/headerAlign
 * - list / tree / gantt 可消费 title/description/width/class
 *
 * 底层 `RendererHostScope` 本身保持透明，不直接解释这些属性。
 */
export interface RendererRowFragmentConfigProps {
  /** 标题位文本。 */
  title?: string
  /** 标签文本（title 别名）。 */
  label?: string
  /** 描述文本。 */
  description?: string
  /** 宽度。 */
  width?: string | number
  /** 最小宽度。 */
  minWidth?: string | number
  /** 内容对齐方式。 */
  align?: RowFragmentAlign
  /** 表头对齐方式。 */
  headerAlign?: RowFragmentAlign
  /** 片段附加 class。 */
  class?: string
  /** CSS Grid 列数。 */
  gridColumns?: number
  /** 栅格间距。 */
  gridGap?: number | string
  /** 栅格行高。 */
  gridAutoRows?: string
  /** 自适应最小宽度。 */
  autoFitMinWidth?: string
  /** 默认跨列数。 */
  defaultColSpan?: number
  /** 标签位置。 */
  labelPosition?: 'top' | 'left' | 'right'
  /** 标签宽度。 */
  labelWidth?: string
  /** 内联模式。 */
  inline?: boolean
  /** 紧凑模式。 */
  compact?: boolean
  /** 片段字段节点列表。 */
  children?: SparkNode[]
}

/**
 * `r-row-fragment` 结构化节点。
 *
 * 作为行片段配置挂在集合宿主下，由宿主按自身语义消费 title/width/fields 等元属性。
 */
export interface RowFragmentNode extends SparkNode {
  /** 节点类型固定为 `r-row-fragment`。 */
  type: 'r-row-fragment'
  /** 行片段结构化配置。 */
  props?: RendererRowFragmentConfigProps & Record<string, unknown>
}

/**
 * `RendererRowFragment` 运行时公开属性。
 *
 * 用于把一组字段组织成可复用的“行片段”，交给 table/list/tree 等宿主决定最终承载方式。
 */
export interface RendererRowFragmentProps {
  /** 组件类型固定为 `r-row-fragment`。 */
  type?: 'r-row-fragment'
  /** 节点标识。 */
  id?: string
  /** 标题位文本。 */
  title?: string
  /** 标签文本（title 别名）。 */
  label?: string
  /** 描述文本。 */
  description?: string
  /** 宽度。 */
  width?: string | number
  /** 最小宽度。 */
  minWidth?: string | number
  /** 内容对齐方式。 */
  align?: RowFragmentAlign
  /** 表头对齐方式。 */
  headerAlign?: RowFragmentAlign
  /** 片段附加 class。 */
  class?: string
  /** CSS Grid 列数。 */
  gridColumns?: number
  /** 栅格间距。 */
  gridGap?: number | string
  /** 栅格行高。 */
  gridAutoRows?: string
  /** 自适应最小宽度。 */
  autoFitMinWidth?: string
  /** 默认跨列数。 */
  defaultColSpan?: number
  /** 标签位置。 */
  labelPosition?: 'top' | 'left' | 'right'
  /** 标签宽度。 */
  labelWidth?: string
  /** 内联模式。 */
  inline?: boolean
  /** 紧凑模式。 */
  compact?: boolean
  /** 当前数据行。 */
  data?: IDataRow
  /** 上游插槽作用域（运行时透传）。 */
  slotScope?: Record<string, unknown>
  /** 片段字段节点列表。 */
  children?: SparkNode[]
}