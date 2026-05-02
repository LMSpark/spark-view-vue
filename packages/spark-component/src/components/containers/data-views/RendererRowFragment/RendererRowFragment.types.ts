import type { SparkNode } from '../../../internal'
import type { SparkNodeProps } from '../../../shared-types'

/** 行片段内容对齐方式。 */
export type RowFragmentAlign = 'left' | 'center' | 'right'

/**
 * `RendererRowFragment` 运行时公开属性。
 *
 * 用于把一组字段组织成可复用的"行片段"，交给 table/list/tree 等宿主决定最终承载方式。
 */
export interface RendererRowFragmentProps extends SparkNodeProps {
  /** 组件类型固定为 `r-row-fragment`。 */
  type?: 'r-row-fragment'
  /** 节点标识。 */
  id?: string
  /** 标题位文本。 */
  title?: string
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
  /** 最后一行不满时自动拉宽。 */
  autoFillLastRow?: boolean
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