/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldCheckboxGroup.props
 * FieldCheckboxGroup 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: CheckboxGroupMultiValue, RCheckboxGroupProps（共 2 个 symbol）。
 */
import type { SparkButtonOptionFieldProps, SparkNodeProps } from '../../shared-types'

/** Checkbox Group Multi Value 的语义模型。 */
export type CheckboxGroupMultiValue = Array<string | number | boolean>

/** RCheckbox Group Props 的属性契约。 */
export type RCheckboxGroupProps = SparkNodeProps & SparkButtonOptionFieldProps<CheckboxGroupMultiValue>
