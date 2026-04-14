import type { SparkNodeProps } from '../../shared-types'

export interface RTooltipProps extends SparkNodeProps {
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
