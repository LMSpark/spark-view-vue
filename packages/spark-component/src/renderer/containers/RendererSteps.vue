<!--
/**
 * @skill r-steps
 * @description 步骤容器，内部使用 r-step 定义步骤；支持 dock 分区工具栏，当前步骤内容区采用 24 列 CSS Grid
 * @input { props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } }, modelValue?: string|number } }
 * @example { "type": "r-steps", "children": [{ "type": "r-step", "props": { "title": "步骤一", "name": "s1" }, "children": [] }] }
 */
-->
<template>
  <div :class="['renderer-steps-layout', `renderer-steps-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-steps-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-steps-toolbar-${index}`"
        :config="action"
      />
    </div>

    <div class="renderer-steps-main">
      <el-steps v-bind="$attrs" :active="activeStepIndex">
        <RendererStepItem
          v-for="(step, index) in stepConfigs"
          :key="getStepKey(step, index)"
          :config="step"
          :index="index"
          mode="header"
          @activate="activateStep"
        />
      </el-steps>

      <RendererStepItem
        v-if="activeStep"
        :config="activeStep"
        :index="activeStepIndex"
        mode="content"
      >
        <slot v-if="!hasStepChildren(activeStep)" v-bind="getStepSlotScope(activeStep, activeStepIndex)" />
      </RendererStepItem>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSparkComponent } from '../_pkg'
import { getDockedChildren, nodeId, nodeInputProp, type SparkNode } from '../_pkg'
import type { ContainerDocks } from '../../types'
import { useContainerToolbar } from './useContainerToolbar'
import RendererStepItem from './RendererStepItem.vue'
import type { RendererStepsApi } from '../_pkg'

interface Props {
  /** 子节点（步骤配置） */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
  /** 当前步骤 */
  modelValue?: string | number
  /** 步骤切换回调 */
  onStepChange?: (value: string | number, step: SparkNode, index: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  docks: () => ({}),
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const { registerApi } = useSparkComponent({ type: 'r-steps' })

const stepConfigs = computed(() =>
  getDockedChildren(props.children).filter(child => child.type === 'r-step')
)
const dockedToolbar = computed(() => getDockedChildren(props.children, 'toolbar'))

const activeStepName = ref<string | number | undefined>(props.modelValue)

watch(() => props.modelValue, (value) => {
  activeStepName.value = value
}, { immediate: true })

watch(stepConfigs, (steps) => {
  if (activeStepName.value !== undefined) return
  const firstStep = steps[0]
  if (!firstStep) return
  activeStepName.value = getStepName(firstStep, 0)
}, { immediate: true })

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => dockedToolbar.value),
  toolbarPosition: computed(() => props.docks?.toolbar?.position),
  toolbarClass: computed(() => props.docks?.toolbar?.class),
  modelPermission: computed(() => undefined),
})

const activeStepIndex = computed(() => {
  const index = stepConfigs.value.findIndex((step, idx) => getStepName(step, idx) === activeStepName.value)
  return index >= 0 ? index : 0
})

const activeStep = computed(() => stepConfigs.value[activeStepIndex.value])

function hasStepChildren(step: SparkNode): boolean {
  return Array.isArray(step.children) && step.children.length > 0
}

function getStepName(step: SparkNode, index: number): string | number {
  const value = nodeInputProp(step, 'name') ?? nodeInputProp(step, 'value') ?? nodeId(step)
  return typeof value === 'string' || typeof value === 'number' ? value : `step-${index}`
}

function getStepKey(step: SparkNode, index: number): string | number {
  return nodeId(step) ?? getStepName(step, index)
}

function activateStep(index: number): void {
  const step = stepConfigs.value[index]
  if (!step) return
  const nextValue = getStepName(step, index)
  activeStepName.value = nextValue
  emit('update:modelValue', nextValue)
  props.onStepChange?.(nextValue, step, index)
}

// ── r-steps 包装 API ─────────────────────────────────────────────────────


const stepsApi: RendererStepsApi = {
  getActiveStep() {
    return activeStepName.value
  },
  getActiveStepIndex() {
    return activeStepIndex.value
  },
  setActiveStep(index) {
    activateStep(index)
  },
  nextStep() {
    const next = activeStepIndex.value + 1
    if (next < stepConfigs.value.length) activateStep(next)
  },
  prevStep() {
    const prev = activeStepIndex.value - 1
    if (prev >= 0) activateStep(prev)
  },
  getStepCount() {
    return stepConfigs.value.length
  },
  getStepNames() {
    return stepConfigs.value.map((step, index) => getStepName(step, index))
  },
  isFirstStep() {
    return activeStepIndex.value === 0
  },
  isLastStep() {
    return activeStepIndex.value >= stepConfigs.value.length - 1
  },
}

registerApi(stepsApi)

defineExpose(stepsApi)

function getStepSlotScope(step: SparkNode, index: number) {
  return {
    step,
    stepIndex: index,
    stepName: getStepName(step, index),
    stepTitle: getStepLabel(step, index),
    activeStepName: activeStepName.value,
  }
}

function getStepLabel(step: SparkNode, index: number): string {
  const value = nodeInputProp(step, 'title') ?? nodeInputProp(step, 'label')
  return typeof value === 'string' && value.trim().length > 0 ? value : `步骤${index + 1}`
}
</script>

<style scoped>
.renderer-steps-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-steps-layout--top,
.renderer-steps-layout--bottom {
  flex-direction: column;
}

.renderer-steps-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-steps-layout--right {
  flex-direction: row-reverse;
}

.renderer-steps-main {
  min-width: 0;
  flex: 1;
}

.renderer-steps-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-steps-layout--left .renderer-steps-toolbar,
.renderer-steps-layout--right .renderer-steps-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-steps-content {
  width: 100%;
  min-width: 0;
  margin-top: 16px;
}

.renderer-steps-grid-item {
  min-width: 0;
}
</style>