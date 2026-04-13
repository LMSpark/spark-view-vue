import type { SparkChildrenProps } from '../../shared-types'

export interface DropdownItem {
  label: string
  command?: string
  disabled?: boolean
  divided?: boolean
  icon?: string
}

export interface RDropdownProps extends SparkChildrenProps<'r-dropdown'> {
  items?: DropdownItem[]
  trigger?: 'hover' | 'click' | 'contextmenu'
  effect?: 'dark' | 'light'
  placement?: string
  hideOnClick?: boolean
  showTimeout?: number
  hideTimeout?: number
  splitButton?: boolean
  popperClass?: string
  maxHeight?: number | string
}
