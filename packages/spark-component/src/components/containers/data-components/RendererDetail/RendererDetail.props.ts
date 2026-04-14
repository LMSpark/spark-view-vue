import type { DataView } from '@spark-view/spark-data'
import type {
  SparkNodeProps,
  SparkTableModelProps,
  SparkCrudEventProps,
} from '../../../shared-types'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'

/**
 * r-detail 组件公开属性接口。
 *
 * 命名规范：组件 type `r-detail` → 接口名 `RDetailProps`。
 */
export interface RDetailProps
  extends SparkNodeProps,
    SparkTableModelProps,
    SparkCrudEventProps {
  /** 显式收窄为详情容器使用的 DataView 数据线。 */
  dataSource?: DataView
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 标题对齐 */
  titleAlign?: 'left' | 'center' | 'right'
  /** 值对齐 */
  valueAlign?: 'left' | 'center' | 'right'
}
