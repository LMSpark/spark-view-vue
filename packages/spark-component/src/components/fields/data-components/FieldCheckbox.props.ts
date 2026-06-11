/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldCheckbox.props
 * FieldCheckbox 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RCheckboxProps（共 1 个 symbol）。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

/** RCheckbox Props 的属性契约。 */
export type RCheckboxProps = SparkNodeProps & SparkFieldSemanticProps<boolean> & {
  /** 选中状态下展示的文本。 */
    checkedText?: string
    /** 未选中状态下展示的文本。 */
    uncheckedText?: string
    /** 复选框旁边的标签文本。 */
    checkboxText?: string}
