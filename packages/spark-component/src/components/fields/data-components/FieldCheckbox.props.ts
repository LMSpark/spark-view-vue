import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

export interface RCheckboxProps extends SparkNodeProps, SparkFieldSemanticProps<boolean> {
  /** 选中状态下展示的文本。 */
    checkedText?: string
    /** 未选中状态下展示的文本。 */
    uncheckedText?: string
    /** 复选框旁边的标签文本。 */
    checkboxText?: string
}
