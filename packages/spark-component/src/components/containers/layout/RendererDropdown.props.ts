import type { SparkFloatingLayerProps, SparkNodeProps } from '../../shared-types'

export interface DropdownItem {
  /** 菜单项文本 */
  label: SparkText
  /** 菜单命令值 */
  command?: SparkText
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示分割线 */
  divided?: boolean
  /** 图标名称 */
  icon?: SparkText
}

export interface RDropdownProps extends SparkNodeProps, SparkFloatingLayerProps {
  /** 菜单项列表 */
  items?: DropdownItem[]
  /** 触发方式 */
  trigger?: 'hover' | 'click' | 'contextmenu'
  /** 点击菜单项后是否自动收起 */
  hideOnClick?: boolean
  /** 展开延迟（毫秒） */
  showTimeout?: number
  /** 收起延迟（毫秒） */
  hideTimeout?: number
  /** 是否使用分裂按钮 */
  splitButton?: boolean
  /** 菜单最大高度 */
  maxHeight?: number | string
}
