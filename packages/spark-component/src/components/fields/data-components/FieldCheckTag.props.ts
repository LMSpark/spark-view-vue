import type { SparkNodeProps } from '../../shared-types'

export type RCheckTagProps = SparkNodeProps & {
  /** 是否选中 */
  checked?: boolean
  /** 标签文本 */
  label?: SparkText
}
