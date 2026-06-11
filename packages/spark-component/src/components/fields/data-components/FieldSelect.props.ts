/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldSelect.props
 * FieldSelect 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RSelectProps（共 1 个 symbol）。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** RSelect Props 的属性契约。 */
export type RSelectProps = SparkNodeProps & SparkOptionFieldProps<string | number>
