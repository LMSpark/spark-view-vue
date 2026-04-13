import type { SparkChildrenProps } from '../../shared-types'

export interface RPopconfirmProps extends SparkChildrenProps<'r-popconfirm'> {
  title?: string
  confirmButtonText?: string
  cancelButtonText?: string
  confirmButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  cancelButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  icon?: string
  iconColor?: string
  hideIcon?: boolean
  hideAfter?: number
  width?: number | string
}
