import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** Transfer 已选值数组；每一项对应穿梭框选项的 value。 */
export type TransferValue = Array<string | number>

export type RTransferProps = SparkNodeProps & SparkOptionFieldProps<TransferValue> & {
  /** 左右面板标题。 */
  titles?: [string, string]
  /** 候选项过滤输入框占位文案。 */
  filterPlaceholder?: SparkText
  /** 目标面板排序策略。 */
  targetOrder?: 'original' | 'push' | 'unshift'
}
