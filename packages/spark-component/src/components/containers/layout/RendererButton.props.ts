import type { SparkNodeProps } from '../../shared-types'
import type { BuiltinActionName } from '../../../page/actions'

export interface RButtonProps extends SparkNodeProps {
  /** CRUD 动作名（如 'refresh', 'delete-row'），由宿主能力决定是否接管执行 */
  action?: BuiltinActionName
  /** 样式模板名（如 'primary', 'toolbar-danger', 'icon-add'） */
  template?: SparkText
  /** 按钮文本 */
  label?: SparkText
  /** 按钮类型 */
  buttonType?: SparkText
  /** 按钮尺寸 */
  buttonSize?: SparkText
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
  icon?: SparkText
  /** 中文按钮文案是否自动插空格 */
  autoInsertSpace?: boolean
  /** 自定义颜色 */
  color?: SparkText
  /** 深色主题 */
  dark?: boolean
}
