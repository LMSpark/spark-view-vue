/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldSegmented.props
 * FieldSegmented 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RSegmentedProps（共 1 个 symbol）。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** 分段控件候选项直接使用原生联合类型，不再额外导出基础类型包装。 */

export type RSegmentedProps = SparkNodeProps & SparkOptionFieldProps<string | number, string | number | { label: string; value: string | number; disabled?: boolean }> & {
  /** 尺寸 */
    size?: 'large' | 'default' | 'small'
    /** 是否占满容器宽度 */
    block?: boolean}
