import type { SparkNodeProps } from '../../shared-types'

export interface RDescriptionsItemProps extends SparkNodeProps {
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
    field?: string
}
