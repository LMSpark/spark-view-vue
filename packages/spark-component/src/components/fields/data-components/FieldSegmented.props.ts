import type { SparkNodeProps } from '../../shared-types'

/** 分段控件候选项 */
export type SegmentedOption = string | number | { label: string; value: string | number; disabled?: boolean }

export interface RSegmentedProps extends SparkNodeProps {
  /** 当前值 */
  modelValue?: string | number
  /** 候选项列表 */
  options?: SegmentedOption[]
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否占满容器宽度 */
  block?: boolean
}
