/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererDropdown.props
 * RendererDropdown 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: DropdownItem, RDropdownProps（共 2 个 symbol）。
 */
import type { SparkFloatingLayerProps, SparkNodeProps } from '../../shared-types'

/** Dropdown Item 的语义模型。 */
export type DropdownItem = {
  /** 菜单项文本 */
  label: string
  /** 菜单命令值 */
  command?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示分割线 */
  divided?: boolean
  /** 图标名称 */
  icon?: string}

/** RDropdown Props 的属性契约。 */
export type RDropdownProps = SparkNodeProps & SparkFloatingLayerProps & {
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
    maxHeight?: number | string}
