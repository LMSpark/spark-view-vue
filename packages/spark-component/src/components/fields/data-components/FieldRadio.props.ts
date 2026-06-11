/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldRadio.props
 * FieldRadio 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RRadioProps（共 1 个 symbol）。
 */
import type { SparkButtonOptionFieldProps, SparkNodeProps } from '../../shared-types'

/** RRadio Props 的属性契约。 */
export type RRadioProps = SparkNodeProps & SparkButtonOptionFieldProps<string | number>
