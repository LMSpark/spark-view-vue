import type { SparkChildrenProps } from '../../shared-types'
import type { SparkNode } from '../../internal'

export interface RPopoverProps extends SparkChildrenProps<'r-popover'> {
  contentChildren?: SparkNode[]
  title?: string
  content?: string
  placement?: string
  width?: number | string
  trigger?: 'click' | 'hover' | 'focus' | 'contextmenu'
  effect?: 'dark' | 'light'
  offset?: number
  showAfter?: number
  hideAfter?: number
  showArrow?: boolean
  popperClass?: string
}
