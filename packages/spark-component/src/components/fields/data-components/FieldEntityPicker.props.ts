import type { PageSelectorOption } from '../../internal'
import type {
  SparkNodeProps,
  SparkOptionFieldProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
} from '../../shared-types'

export type REntityPickerProps = SparkNodeProps & SparkOptionFieldProps<PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string> & SparkPrimaryActionTextProps & SparkReadonlyActionTextProps & {
  /** 是否允许对实体候选项执行搜索。 */
    searchable?: boolean
    /** 实体类型名称，用于驱动选择器语义或远端查询。 */
    entityName?: string}
