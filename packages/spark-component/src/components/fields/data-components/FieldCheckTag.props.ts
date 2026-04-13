import type { SparkComponentBaseProps } from '../../shared-types'

export interface RCheckTagProps extends SparkComponentBaseProps<'r-check-tag'> {
  /** 是否选中 */
  checked?: boolean
  /** 标签文本 */
  label?: string
}
