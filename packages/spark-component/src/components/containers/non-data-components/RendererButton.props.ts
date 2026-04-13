import type { SparkChildrenProps } from '../../shared-types'

export interface RButtonProps extends SparkChildrenProps<'r-button'> {
  /** CRUD 动作名（如 'refresh', 'delete-row'），由容器自动绑定处理器 */
  action?: string
  /** 样式模板名（如 'primary', 'toolbar-danger', 'icon-add'） */
  template?: string
  /** 按钮文本 */
  label?: string
  /** 按钮类型 */
  buttonType?: string
  /** 按钮尺寸 */
  buttonSize?: string
  /** 是否朴素按钮 */
  plain?: boolean
  /** 是否文本按钮 */
  text?: boolean
  /** 文本按钮是否显示背景 */
  bg?: boolean
  /** 是否链接风格 */
  link?: boolean
  /** 是否圆角 */
  round?: boolean
  /** 是否圆形按钮 */
  circle?: boolean
  /** 是否加载中 */
  loading?: boolean
  /** 图标名称 */
  icon?: string
  /** 中文按钮文案是否自动插空格 */
  autoInsertSpace?: boolean
  /** 自定义颜色 */
  color?: string
  /** 深色主题 */
  dark?: boolean
}
