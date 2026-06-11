/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldNumber.props
 * FieldNumber 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RNumberProps（共 1 个 symbol）。
 */
import type { SparkNodeProps, SparkRangeNumericFieldProps } from '../../shared-types'

/** RNumber Props 的属性契约。 */
export type RNumberProps = SparkNodeProps & SparkRangeNumericFieldProps<number | [number | undefined, number | undefined]> & {
  /** 数值展示与写回时使用的小数精度。 */
    precision?: number}
