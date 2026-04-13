import type { DataView } from '@spark-view/spark-data'
import type {
  SparkChildrenProps,
  SparkTableModelProps,
  SparkCrudEventProps,
  SparkRowInteractionEventProps,
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
  extends SparkChildrenProps,
    SparkTableModelProps<DataView>,
    SparkCrudEventProps,
    SparkRowInteractionEventProps {
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 结构化筛选区 */
  filter?: FilterNode
  /** 结构化行动作 */
  actions?: ActionsNode
}
