import type { SparkComponentBaseProps } from '../../shared-types'

export interface RAlertProps extends SparkComponentBaseProps<'r-alert'> {
title?: string
  description?: string
  alertType?: 'success' | 'warning' | 'info' | 'error'
  closable?: boolean
  closeText?: string
  center?: boolean
  showIcon?: boolean
  effect?: 'light' | 'dark'
}
