import type { SparkChildrenProps } from '../../shared-types'

export interface RButtonProps extends SparkChildrenProps<'r-button'> {
  /** CRUD 动作名（如 'refresh', 'delete-row'），由容器自动绑定处理器 */
  action?: string
  /** 样式模板名（如 'primary', 'toolbar-danger', 'icon-add'） */
  template?: string
  label?: string
  buttonType?: string
  buttonSize?: string
  plain?: boolean
  text?: boolean
  bg?: boolean
  link?: boolean
  round?: boolean
  circle?: boolean
  loading?: boolean
  icon?: string
  autoInsertSpace?: boolean
  color?: string
  dark?: boolean
}
