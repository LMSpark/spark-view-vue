import type { DataMember, DataView } from '@spark-view/spark-data'
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
export interface RDetailProps extends SparkNodeProps, SparkCrudDataContainerProps, SparkGridLayoutProps {
  /** 显式收窄为详情容器使用的 DataView 数据线。 */
    dataSource?: DataView
    /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 上下文 DataView 成员，默认 currentRow。 */
    contextDataMember?: DataMember | `${DataMember}`
    /** 上下文成员内部业务字段或点路径。 */
    contextDataField?: string
    /** 没有显式 children 时，是否从 DataView.columns 自动生成字段。默认 true。 */
    autoColumns?: boolean
    /** 标题对齐 */
    titleAlign?: 'left' | 'center' | 'right'
    /** 值对齐 */
    valueAlign?: 'left' | 'center' | 'right'
    /** 透传给详情根节点的显式属性 */
    detailProps?: Record<string, unknown>
}
