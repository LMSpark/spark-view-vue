import type { SparkNodeProps } from '../../../shared-types'
import type { RToolbarProps } from '../RendererToolbar.types'

export interface TabsClickEvent {
  /** 当前点击标签页的 paneName */
  paneName?: string | number
  [key: string]: unknown
}

export interface RTabsProps extends SparkNodeProps {
  /** 结构化工具栏 */
  toolbar?: RToolbarProps
  /** 当前激活标签页 */
  modelValue?: string | number
  /** 标签页切换回调（activeName 变更） */
  onTabChange?: (name: string | number) => void
  /** 标签页点击回调 */
  onTabClick?: (pane: TabsClickEvent, event: Event) => void
}
