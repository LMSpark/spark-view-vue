import type { SparkBoundedFieldProps, SparkNodeProps } from '../../shared-types'

export interface RSliderProps extends SparkNodeProps, SparkBoundedFieldProps<number> {
  /** 滑块步进值。 */
    step?: number
    /** 是否显示数值输入框。 */
    showInput?: boolean
}
