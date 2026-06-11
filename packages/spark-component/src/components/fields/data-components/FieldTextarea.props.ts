/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldTextarea.props
 * FieldTextarea 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RTextareaProps（共 1 个 symbol）。
 */
import type { SparkMultilineFieldProps, SparkNodeProps } from '../../shared-types'

/** RTextarea Props 的属性契约。 */
export type RTextareaProps = SparkNodeProps & SparkMultilineFieldProps<string> & {
  /** 是否根据内容自动伸缩高度。 */
    autosize?: boolean | { minRows?: number; maxRows?: number }
    /** 最大输入长度。 */
    maxlength?: number
    /** 是否显示字数统计。 */
    showWordLimit?: boolean}
