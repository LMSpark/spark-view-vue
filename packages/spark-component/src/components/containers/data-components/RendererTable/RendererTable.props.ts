import type { DataView } from '@spark-view/spark-data'
import type {
  SparkInteractiveDataContainerProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'
import type { FilterNode } from '../../RendererFilter.types'
import type { ActionsNode } from '../../support/RendererActionHost.types'

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
  /**
   * 透传给底层 el-table 的显式属性集合。
   *
   * 说明：不再依赖 attrs 隐式透传，统一通过该入口传递 rowKey/treeProps/highlightCurrentRow 等底层参数。
   */
  tableProps?: Record<string, unknown>
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 结构化筛选区 */
  filter?: FilterNode
  /** 结构化行动作 */
  actions?: ActionsNode
}
