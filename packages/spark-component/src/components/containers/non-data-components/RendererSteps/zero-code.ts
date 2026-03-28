import type { SparkNode } from '../../../internal'
import type { RendererStepsApi } from './types'

interface ValueRef<T> {
  value: T
}

type StepsEmit = (event: 'update:modelValue', value: string | number) => void

interface RendererStepsZeroCodeOptions {
  emit: StepsEmit
  stepConfigs: ValueRef<SparkNode[]>
  activeStepName: ValueRef<string | number | undefined>
  activeStepIndex: ValueRef<number>
  getStepName: (step: SparkNode, index: number) => string | number
  onStepChange: ((value: string | number, step: SparkNode, index: number) => void) | undefined
}

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