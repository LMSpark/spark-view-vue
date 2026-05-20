import type { SparkMultilineFieldProps, SparkNodeProps } from '../../shared-types'

export type RTextareaProps = SparkNodeProps & SparkMultilineFieldProps<string> & {
  /** 是否根据内容自动伸缩高度。 */
  autosize?: boolean | { minRows?: number; maxRows?: number }
  /** 最大输入长度。 */
  maxlength?: number
  /** 是否显示字数统计。 */
  showWordLimit?: boolean
}
