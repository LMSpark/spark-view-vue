/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldEntityPicker.props
 * FieldEntityPicker 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: REntityPickerProps（共 1 个 symbol）。
 */
import type { PageSelectorOption } from '../../internal'
import type {
  SparkNodeProps,
  SparkOptionFieldProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
} from '../../shared-types'

/** REntity Picker Props 的属性契约。 */
export type REntityPickerProps = SparkNodeProps & SparkOptionFieldProps<PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string> & SparkPrimaryActionTextProps & SparkReadonlyActionTextProps & {
  /** 是否允许对实体候选项执行搜索。 */
    searchable?: boolean
    /** 实体类型名称，用于驱动选择器语义或远端查询。 */
    entityName?: string}
