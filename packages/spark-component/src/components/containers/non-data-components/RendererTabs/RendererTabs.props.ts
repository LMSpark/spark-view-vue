import type { SparkChildrenProps } from '../../../shared-types'
import type { ToolbarNode } from '../RendererToolbar.types'

export interface TabsClickEvent {
  paneName?: string | number
  [key: string]: unknown
}

export interface RTabsProps extends SparkChildrenProps<'r-tabs'> {
  /** 结构化工具栏 */
  toolbar?: ToolbarNode
  /** 当前激活标签页 */
  modelValue?: string | number
  /** 标签页切换回调 */
  onTabChange?: (name: string | number) => void
  /** 标签页点击回调 */
  onTabClick?: (pane: TabsClickEvent, event: Event) => void
}
