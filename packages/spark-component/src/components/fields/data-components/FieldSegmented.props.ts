import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** 分段控件候选项直接使用原生联合类型，不再额外导出基础类型包装。 */

export interface RSegmentedProps extends SparkNodeProps, SparkOptionFieldProps<string | number, string | number | { label: string; value: string | number; disabled?: boolean }> {
  /** 尺寸 */
    size?: 'large' | 'default' | 'small'
    /** 是否占满容器宽度 */
    block?: boolean
}
