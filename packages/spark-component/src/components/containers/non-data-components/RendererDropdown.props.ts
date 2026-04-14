import type { SparkNodeProps } from '../../shared-types'

export interface DropdownItem {
  /** 菜单项文本 */
  label: string
  /** 菜单命令值 */
  command?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示分割线 */
  divided?: boolean
  /** 图标名称 */
  icon?: string
}

export interface RDropdownProps extends SparkNodeProps {
  /** 菜单项列表 */
  items?: DropdownItem[]
  /** 触发方式 */
  trigger?: 'hover' | 'click' | 'contextmenu'
  /** 主题 */
  effect?: 'dark' | 'light'
  /** 菜单弹出位置 */
  placement?: string
  /** 点击菜单项后是否自动收起 */
  hideOnClick?: boolean
  /** 展开延迟（毫秒） */
  showTimeout?: number
  /** 收起延迟（毫秒） */
  hideTimeout?: number
  /** 是否使用分裂按钮 */
  splitButton?: boolean
  /** 浮层 class */
  popperClass?: string
  /** 菜单最大高度 */
  maxHeight?: number | string
}
