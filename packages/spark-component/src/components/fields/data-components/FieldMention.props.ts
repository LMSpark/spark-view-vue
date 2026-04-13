import type { SparkComponentBaseProps } from '../../shared-types'

export interface MentionOption {
  value: string
  label?: string
  disabled?: boolean
}

export interface RMentionProps extends SparkComponentBaseProps<'r-mention'> {
  modelValue?: string
  options?: MentionOption[]
  prefix?: string | string[]
  split?: string
  filterOption?: boolean | ((pattern: string, option: MentionOption) => boolean)
  placement?: 'top' | 'bottom'
  showArrow?: boolean
  offset?: number
  whole?: boolean
  checkIsWhole?: (pattern: string, prefix: string) => boolean
  loading?: boolean
  inputType?: 'text' | 'textarea'
  placeholder?: string
  rows?: number
}
