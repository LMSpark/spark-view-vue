/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSteps/zero-code
 * RendererSteps 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: StepsEmit, RendererStepsZeroCodeOptions（共 2 个 symbol）。
 */
import type { SparkNode } from '../../../internal'
import type { RendererStepsApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Steps Emit 的语义模型。 */
type StepsEmit = {
  (event: 'update:modelValue', value: string | number): void}

/** Renderer Steps Zero Code Options 的调用配置。 */
type RendererStepsZeroCodeOptions = {
    /** emit 字段。 */
emit: StepsEmit
    /** step Configs 字段。 */
stepConfigs: ValueRef<SparkNode[]>
    /** active Step Name 名称。 */
activeStepName: ValueRef<string | number | undefined>
    /** active Step Index 字段。 */
activeStepIndex: ValueRef<number>
    /** get Step Name 名称。 */
getStepName: (step: SparkNode, index: number) => string | number
    /** on Step Change 事件回调。 */
onStepChange: ((value: string | number, step: SparkNode, index: number) => void) | undefined}

export function createRendererStepsZeroCode(options: RendererStepsZeroCodeOptions) {
  function activateStep(index: number): void {
    const step = options.stepConfigs.value[index]
    if (!step) return
    const nextValue = options.getStepName(step, index)
    options.activeStepName.value = nextValue
    options.emit('update:modelValue', nextValue)
    options.onStepChange?.(nextValue, step, index)
  }

  const stepsApi: RendererStepsApi = {
    getActiveStep() {
      return options.activeStepName.value
    },
    getActiveStepIndex() {
      return options.activeStepIndex.value
    },
    setActiveStep(index) {
      activateStep(index)
    },
    nextStep() {
      const next = options.activeStepIndex.value + 1
      if (next < options.stepConfigs.value.length) activateStep(next)
    },
    prevStep() {
      const prev = options.activeStepIndex.value - 1
      if (prev >= 0) activateStep(prev)
    },
    getStepCount() {
      return options.stepConfigs.value.length
    },
    getStepNames() {
      return options.stepConfigs.value.map((step, index) => options.getStepName(step, index))
    },
    isFirstStep() {
      return options.activeStepIndex.value === 0
    },
    isLastStep() {
      return options.activeStepIndex.value >= options.stepConfigs.value.length - 1
    },
  }

  return {
    stepsApi,
    activateStep,
  }
}