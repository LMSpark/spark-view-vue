import type { SparkChildrenProps } from '../../shared-types'

export interface RLinkProps extends SparkChildrenProps<'r-link'> {
  label?: string
  linkType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  underline?: boolean
  href?: string
  target?: '_blank' | '_self' | '_parent' | '_top'
}
