import type { SparkComponentBaseProps } from '../../shared-types'

export interface MentionOption {
  /** 展示值（必填） */
  value: string
  /** 展示标签 */
  label?: string
  /** 是否禁用 */
  disabled?: boolean
}

export interface RMentionProps extends SparkComponentBaseProps<'r-mention'> {
  /** 输入值 */
  modelValue?: string
  /** 候选项 */
  options?: MentionOption[]
  /** 触发前缀 */
  prefix?: string | string[]
  /** 分隔符 */
  split?: string
  /** 过滤逻辑 */
  filterOption?: boolean | ((pattern: string, option: MentionOption) => boolean)
  /** 候选浮层位置 */
  placement?: 'top' | 'bottom'
  /** 是否显示箭头 */
  showArrow?: boolean
  /** 浮层偏移 */
  offset?: number
  /** 是否整词匹配 */
  whole?: boolean
  /** 自定义整词判断 */
  checkIsWhole?: (pattern: string, prefix: string) => boolean
  /** 是否加载态 */
  loading?: boolean
  /** 输入框类型 */
  inputType?: 'text' | 'textarea'
  /** 占位文本 */
  placeholder?: string
  /** 多行输入行数 */
  rows?: number
}
