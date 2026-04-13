import type { SparkChildrenProps } from '../../../shared-types'
import type { SparkNode } from '../../../internal'
import type { ToolbarNode } from '../RendererToolbar.types'

export interface RStepsProps extends SparkChildrenProps<'r-steps'> {
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 当前步骤 */
  modelValue?: string | number
  /** 步骤切换回调（value 为当前 step 的 value） */
  onStepChange?: (value: string | number, step: SparkNode, index: number) => void
}
