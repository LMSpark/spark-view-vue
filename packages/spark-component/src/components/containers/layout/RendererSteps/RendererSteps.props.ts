import type { SparkNodeProps } from '../../../shared-types'
import type { SparkNode } from '../../../internal'
import type { RToolbarProps } from '../RendererToolbar.types'

export type RStepsProps = SparkNodeProps & {
  /** 结构化工具栏 */
  toolbar?: RToolbarProps
  /** 当前步骤 */
  modelValue?: SparkText | number
  /** 步骤切换回调（value 为当前 step 的 value） */
  onStepChange?: (value: SparkText | number, step: SparkNode, index: number) => void
}
