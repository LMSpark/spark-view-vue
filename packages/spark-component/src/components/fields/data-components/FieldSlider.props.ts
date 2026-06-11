/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldSlider.props
 * FieldSlider 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RSliderProps（共 1 个 symbol）。
 */
import type { SparkBoundedFieldProps, SparkNodeProps } from '../../shared-types'

/** RSlider Props 的属性契约。 */
export type RSliderProps = SparkNodeProps & SparkBoundedFieldProps<number> & {
  /** 滑块步进值。 */
    step?: number
    /** 是否显示数值输入框。 */
    showInput?: boolean}
