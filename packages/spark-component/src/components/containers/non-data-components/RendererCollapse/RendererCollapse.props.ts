import type { SparkNodeProps } from '../../../shared-types'
import type { RToolbarProps } from '../RendererToolbar.types'

export type CollapseValue = string | number | Array<string | number>

export interface RCollapseProps extends SparkNodeProps {
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: RToolbarProps
  /** 当前展开的面板 */
  modelValue?: CollapseValue
  /** 展开/折叠切换回调 */
  onChange?: (value: CollapseValue) => void
}
