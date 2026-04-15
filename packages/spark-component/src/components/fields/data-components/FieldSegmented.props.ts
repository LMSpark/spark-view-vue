import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** 分段控件候选项 */
export type SegmentedOption = string | number | { label: string; value: string | number; disabled?: boolean }

export interface RSegmentedProps
  extends SparkNodeProps,
    SparkOptionFieldProps<string | number, SegmentedOption> {
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否占满容器宽度 */
  block?: boolean
}
