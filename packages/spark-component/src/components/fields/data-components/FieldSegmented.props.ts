import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** 分段控件候选项 */
export type SegmentedOption = string | number | { label: SparkText; value: SparkText | number; disabled?: boolean }

export type RSegmentedProps = SparkNodeProps & SparkOptionFieldProps<string | number, SegmentedOption> & {
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否占满容器宽度 */
  block?: boolean
}
