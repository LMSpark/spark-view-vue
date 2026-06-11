/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayDescriptionsItem.props
 * DisplayDescriptionsItem 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RDescriptionsItemProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RDescriptions Item Props 的属性契约。 */
export type RDescriptionsItemProps = SparkNodeProps & {
  /** 描述项标签文本 */
    label?: string
    /** 该项占据的列数 */
    span?: number
    /** 标签对齐方式 */
    labelAlign?: 'left' | 'center' | 'right'
    /** 内容对齐方式 */
    contentAlign?: 'left' | 'center' | 'right'
    /** 标签自定义 class */
    labelClassName?: string
    /** 内容自定义 class */
    className?: string
    /** 显式内容文本 */
    content?: string
    /** 显式展示值 */
    value?: unknown
    /** 数据字段绑定键 */
    field?: string}
