/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSteps/RendererSteps.props
 * RendererSteps 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RStepsProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../../shared-types'
import type { SparkNode } from '../../../internal'
import type { RToolbarProps } from '../RendererToolbar.types'

/** RSteps Props 的属性契约。 */
export type RStepsProps = SparkNodeProps & {
  /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 当前步骤 */
    modelValue?: string | number
    /** 步骤切换回调（value 为当前 step 的 value） */
    onStepChange?: (value: string | number, step: SparkNode, index: number) => void}
