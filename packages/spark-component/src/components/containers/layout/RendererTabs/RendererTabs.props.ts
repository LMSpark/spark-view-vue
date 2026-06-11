/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererTabs/RendererTabs.props
 * RendererTabs 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: TabsClickEvent, RTabsProps（共 2 个 symbol）。
 */
import type { SparkNodeProps } from '../../../shared-types'
import type { RToolbarProps } from '../RendererToolbar.types'

/** Tabs Click Event 的事件载荷。 */
export type TabsClickEvent = {
  /** 当前点击标签页的 paneName */
  paneName?: string | number
  [key: string]: unknown}

/** RTabs Props 的属性契约。 */
export type RTabsProps = SparkNodeProps & {
  /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 当前激活标签页 */
    modelValue?: string | number
    /** 标签页切换回调（activeName 变更） */
    onTabChange?: (name: string | number) => void
    /** 标签页点击回调 */
    onTabClick?: (pane: TabsClickEvent, event: Event) => void}
