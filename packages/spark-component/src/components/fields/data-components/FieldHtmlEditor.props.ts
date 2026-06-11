/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldHtmlEditor.props
 * FieldHtmlEditor 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RHtmlEditorProps（共 1 个 symbol）。
 */
import type { SparkMultilineFieldProps, SparkNodeProps } from '../../shared-types'

/** RHtml Editor Props 的属性契约。 */
export type RHtmlEditorProps = SparkNodeProps & SparkMultilineFieldProps<string>
