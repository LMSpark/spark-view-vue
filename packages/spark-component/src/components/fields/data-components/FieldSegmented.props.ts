import type { SparkOptionFieldProps } from '../../shared-types'

/** 分段控件候选项 */
export type SegmentedOption = string | number | { label: string; value: string | number; disabled?: boolean }

export interface RSegmentedProps extends SparkOptionFieldProps {
  /** 当前值 */
  value?: string | number
  /**
   * 静态候选项列表。
   *
   * 这里只约束本地字面量 options 的写法；
   * 若通过 optionKey 动态绑定 DataSource，运行时会先做统一选项归一化，再转换成 segmented 组件需要的候选项结构。
   */
  options?: SegmentedOption[]
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否占满容器宽度 */
  block?: boolean
}
