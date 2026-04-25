import type { IDataRow } from '@spark-view/spark-data'
import type { FilterItemConfig } from '../../core/types.js'
import type { SparkNode } from '../internal'

/**
 * `r-filter` 结构化配置属性。
 *
 * 由表格等容器读取，用于决定筛选区布局、折叠能力和字段配置。
 */
export interface RendererFilterConfigProps extends Record<string, unknown> {
  /** 筛选区附加 class。 */
  class?: string
  /** 筛选列配置。 */
  columns?: Array<string | FilterItemConfig>
  /** 是否允许折叠。 */
  collapsible?: boolean
  /** 初始是否折叠。 */
  defaultCollapsed?: boolean
  /** 自适应最小宽度。 */
  autoFitMinWidth?: string
  /** 每个筛选项占据的栅格列数。 */
  itemSpan?: number
  /** 操作区占据的栅格列数，默认跟随 itemSpan。 */
  actionSpan?: number
  /** CSS Grid 列数。 */
  gridColumns?: number
  /** 栅格间距。 */
  gridGap?: number | string
  /** 栅格行高。 */
  gridAutoRows?: string
}

/**
 * `r-filter` 结构化节点。
 *
 * 作为结构化子节点挂在表格等容器下，容器可通过 `filter` 配置读取。
 */
export interface FilterNode extends SparkNode {
  /** 节点类型固定为 `r-filter`。 */
  type: 'r-filter'
  /** 筛选区结构化配置。 */
  props?: RendererFilterConfigProps
  /** 筛选项节点列表。 */
  children?: SparkNode[]
}

/**
 * `RendererFilter` 运行时公开属性。
 *
 * 既可由 `r-filter` 结构节点投影而来，也可由容器显式传入。
 */
export interface RendererFilterProps {
  /** 组件类型固定为 `r-filter`。 */
  type?: 'r-filter'
  /** 节点标识。 */
  id?: string
  /** 默认筛选项节点列表。 */
  children?: SparkNode[]
  /** 筛选条件绑定的数据行 */
  model?: IDataRow
  /** 筛选项配置节点 */
  configs?: SparkNode[]
  /** 当前激活的筛选条件数 */
  activeCount?: number
  /** 是否处于折叠状态 */
  collapsed?: boolean
  /** 筛选列配置 */
  columns?: Array<string | FilterItemConfig>
  /** 是否允许折叠 */
  collapsible?: boolean
  /** 初始是否折叠 */
  defaultCollapsed?: boolean
  /** 自适应最小宽度 */
  autoFitMinWidth?: string
  /** 每个筛选项占据的栅格列数 */
  itemSpan?: number
  /** 操作区占据的栅格列数，默认跟随 itemSpan */
  actionSpan?: number
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 搜索动作回调 */
  searchAction?: () => Promise<void> | void
  /** 重置动作回调 */
  resetAction?: () => Promise<void> | void
  /** 折叠切换动作回调 */
  toggleCollapsedAction?: () => void
}
