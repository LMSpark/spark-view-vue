import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

export interface RSwitchProps extends SparkNodeProps, SparkFieldSemanticProps<boolean | null> {
  /** 打开状态下展示的文本。 */
  activeText?: SparkText
  /** 关闭状态下展示的文本。 */
  inactiveText?: SparkText
}
