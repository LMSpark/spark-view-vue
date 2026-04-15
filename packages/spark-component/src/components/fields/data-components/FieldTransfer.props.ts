import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

export type TransferValue = Array<string | number>

export interface RTransferProps extends SparkNodeProps, SparkOptionFieldProps<TransferValue> {
  /** 左右面板标题。 */
  titles?: [string, string]
  /** 候选项过滤输入框占位文案。 */
  filterPlaceholder?: string
  /** 目标面板排序策略。 */
  targetOrder?: 'original' | 'push' | 'unshift'
}
