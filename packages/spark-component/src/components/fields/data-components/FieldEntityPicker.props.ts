import type { PageSelectableValue } from '@spark-view/spark-utils'
import type {
  SparkNodeProps,
  SparkOptionFieldProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
} from '../../shared-types'

export type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

export interface REntityPickerProps
  extends SparkNodeProps,
    SparkOptionFieldProps<EntityPickerValue>,
    SparkPrimaryActionTextProps,
    SparkReadonlyActionTextProps {
  /** 是否允许对实体候选项执行搜索。 */
  searchable?: boolean
  /** 实体类型名称，用于驱动选择器语义或远端查询。 */
  entityName?: string
}
