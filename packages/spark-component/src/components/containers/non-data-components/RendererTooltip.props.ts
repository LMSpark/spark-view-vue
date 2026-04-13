import type { SparkChildrenProps } from '../../shared-types'

export interface RTooltipProps extends SparkChildrenProps<'r-tooltip'> {
  content?: string
  placement?: string
  effect?: 'dark' | 'light'
  offset?: number
  showAfter?: number
  hideAfter?: number
  showArrow?: boolean
  enterable?: boolean
  popperClass?: string
  rawContent?: boolean
}
