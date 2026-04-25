import type { SparkNodeProps } from '../../../shared-types'
import type { ToolbarNode } from '../RendererToolbar.types'

export interface TabsClickEvent {
  /** 当前点击标签页的 paneName */
  paneName?: SparkText | number
  [key: SparkText]: unknown
}

export interface RTabsProps extends SparkNodeProps {
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 当前激活标签页 */
  value?: SparkText | number
  /** 标签页切换回调（activeName 变更） */
  onTabChange?: (name: SparkText | number) => void
  /** 标签页点击回调 */
  onTabClick?: (pane: TabsClickEvent, event: Event) => void
}
