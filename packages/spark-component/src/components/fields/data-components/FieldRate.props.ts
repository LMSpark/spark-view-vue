/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldRate.props
 * FieldRate 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RRateProps（共 1 个 symbol）。
 */
import type { SparkMaxNumericFieldProps, SparkNodeProps } from '../../shared-types'

/** RRate Props 的属性契约。 */
export type RRateProps = SparkNodeProps & SparkMaxNumericFieldProps<number> & {
  /** 是否允许选择半星。 */
    allowHalf?: boolean}
