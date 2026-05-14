import type { DataView } from '@spark-view/spark-data'
import type {
  SparkCrudDataContainerProps,
  SparkGridLayoutProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../layout/RendererToolbar.types'

/**
 * r-detail 组件公开属性接口。
 *
 * 命名规范：组件 type `r-detail` → 接口名 `RDetailProps`。
 */
export interface RDetailProps
  extends SparkNodeProps,
    SparkCrudDataContainerProps,
    SparkGridLayoutProps {
  /** 显式收窄为详情容器使用的 DataView 数据线。 */
  dataSource?: DataView
  /** 结构化工具栏 */
  toolbar?: RToolbarProps
  /** 标题对齐 */
  titleAlign?: 'left' | 'center' | 'right'
  /** 值对齐 */
  valueAlign?: 'left' | 'center' | 'right'
  /** 透传给详情根节点的显式属性 */
  detailProps?: Record<string, unknown>
}
