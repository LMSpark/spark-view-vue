import type { DataView } from '@spark-view/spark-data'
import type {
  SparkInteractiveDataContainerProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../non-data-components/RendererToolbar.types'
import type { RendererFilterProps } from '../../RendererFilter.types'

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
  /**
   * 结构化工具栏
   * 提示词模板：默认动作 append-row / refresh / delete-current。
   * @componentRef r-toolbar
   */
  toolbar?: RToolbarProps
  /**
   * 结构化筛选区
   * 提示词模板：常用字段过滤 + range 过滤；优先复用列字段并保持字段名一致。
   * @componentRef r-filter
   */
  filter?: RendererFilterProps
  /**
   * 结构化行动作
   * 提示词模板：默认动作 message-row / delete-row。
   * @componentRef r-toolbar
   */
  actions?: RToolbarProps
}
