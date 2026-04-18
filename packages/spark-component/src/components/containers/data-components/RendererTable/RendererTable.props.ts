import type { DataView } from '@spark-view/spark-data'
import type {
  SparkInteractiveDataContainerProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'
import type { FilterNode } from '../../RendererFilter.types'
import type { ActionsAlign, ActionsFixed, ActionsNode } from '../../support/RendererActions.types'

/**
 * r-table 组件公开属性接口。
 *
 * 命名规范：组件 type `r-table` → 接口名 `RTableProps`。
 */
export interface RTableProps
  extends SparkNodeProps,
    SparkInteractiveDataContainerProps {
  /** 显式收窄为表格容器使用的 DataView 数据线。 */
  dataSource?: DataView
  /** 过滤面板是否允许折叠。 */
  filterCollapsible?: boolean
  /** 过滤面板初始是否折叠。 */
  filterDefaultCollapsed?: boolean
  /** 过滤面板自适应最小宽度。 */
  filterAutoFitMinWidth?: string
  /** 单个过滤项默认占据的栅格列数。 */
  filterItemSpan?: number
  /** 过滤面板操作区占据的栅格列数。 */
  filterActionSpan?: number
  /**
   * 透传给底层 el-table 的显式属性集合。
   *
   * 说明：不再依赖 attrs 隐式透传，统一通过该入口传递 rowKey/treeProps/highlightCurrentRow 等底层参数。
   */
  tableProps?: Record<string, unknown>
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 行操作列标题（历史兼容字段，优先级低于 r-actions.props.label） */
  rowActionsLabel?: string
  /** 行操作列宽度（历史兼容字段，优先级低于 r-actions.props.width） */
  rowActionsWidth?: string | number
  /** 行操作列对齐（历史兼容字段，优先级低于 r-actions.props.align） */
  rowActionsAlign?: ActionsAlign
  /** 行操作列固定（历史兼容字段，优先级低于 r-actions.props.fixed） */
  rowActionsFixed?: ActionsFixed
  /** 结构化筛选区 */
  filter?: FilterNode
  /** 结构化行动作 */
  actions?: ActionsNode
}
