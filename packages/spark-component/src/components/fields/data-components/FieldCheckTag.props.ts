/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldCheckTag.props
 * FieldCheckTag 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RCheckTagProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RCheck Tag Props 的属性契约。 */
export type RCheckTagProps = SparkNodeProps & {
  /** 是否选中 */
    checked?: boolean
    /** 标签文本 */
    label?: string}
