/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldTransfer.props
 * FieldTransfer 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: TransferValue, RTransferProps（共 2 个 symbol）。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** Transfer 已选值数组；每一项对应穿梭框选项的 value。 */
export type TransferValue = Array<string | number>

/** RTransfer Props 的属性契约。 */
export type RTransferProps = SparkNodeProps & SparkOptionFieldProps<TransferValue> & {
  /** 左右面板标题。 */
    titles?: [string, string]
    /** 候选项过滤输入框占位文案。 */
    filterPlaceholder?: string
    /** 目标面板排序策略。 */
    targetOrder?: 'original' | 'push' | 'unshift'}
