import type { CSSProperties } from 'vue'
import type { DataView } from '@spark-view/spark-data'
import type {
  SparkChildrenProps,
  SparkTableModelProps,
  SparkCrudEventProps,
} from '../../../shared-types'
import type { RowClickHandler } from '../../support'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'
import type { ActionsNode } from '../../support/RendererActionHost.types'

/**
 * r-list 组件公开属性接口。
 *
 * 命名规范：组件 type `r-list` → 接口名 `RListProps`。
 */
export interface RListProps
  extends SparkChildrenProps,
    SparkTableModelProps<DataView>,
    SparkCrudEventProps {
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 结构化列表项动作 */
  actions?: ActionsNode
  /** 列数 */
  columns?: number
  /** 列表项间距 */
  gap?: number | string
  /** 最小项宽度 */
  minItemWidth?: string
  /** 行唯一键字段 */
  rowKey?: string
  /** 空数据提示文案 */
  emptyText?: string
  /** 列表项 CSS 类名 */
  itemClass?: string
  /** 列表项行内样式 */
  itemStyle?: CSSProperties
  /** 使用卡片包裹 */
  useCard?: boolean
  /** 卡片阴影模式 */
  cardShadow?: 'always' | 'hover' | 'never'
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 项跨列数 */
  itemColSpan?: number
  /** 项跨行数 */
  itemRowSpan?: number
  /** 列表项点击回调 */
  onItemClick?: RowClickHandler
}
