<!--
/**
 * @skill r-steps
 * @description 步骤容器，内部使用 r-step 定义步骤；当前步骤内容区采用 24 列 CSS Grid
 * @input { props: { modelValue?: string|number, toolbar?: ComponentConfig[] } }
 * @example { "type": "r-steps", "children": [{ "type": "r-step", "props": { "title": "步骤一", "name": "s1" }, "children": [] }] }
 */
-->
<template>
  <div :class="['renderer-steps-layout', `renderer-steps-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-steps-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-steps-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
    </div>

    <div class="renderer-steps-main">
      <el-steps v-bind="$attrs" :active="activeStepIndex">
        <el-step
          v-for="(step, index) in stepConfigs"
          :key="getStepKey(step, index)"
          :title="getStepTitle(step, index)"
          :description="getStepDescription(step)"
          :status="getStepStatus(step)"
          @click="activateStep(index)"
        />
      </el-steps>

      <div v-if="activeStep" :class="['renderer-steps-content', getStepBodyClass(activeStep)]" :style="getStepGridStyle(activeStep)">
        <template v-if="getStepChildren(activeStep).length">
          <div
            v-for="(child, index) in getStepChildren(activeStep)"
            :key="child.id ?? `r-step-child-${index}`"
            class="renderer-steps-grid-item"
            :style="getStepChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </template>
        <slot v-else v-bind="getStepSlotScope(activeStep, activeStepIndex)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useContainerToolbar } from './useContainerToolbar'
import { createToolbarSlotScope } from './useContainerSlotScopes'
import { normalizeGridGap, normalizeSpan } from './useContainerGrid'

interface Props {
  config?: ComponentConfig
  sparkChildren?: ComponentConfig[]
  toolbar?: ComponentConfig[]
  toolbarPosition?: 'top' | 'bottom' | 'left' | 'right'
  toolbarClass?: string
  modelValue?: string | number
  onStepChange?: (value: string | number, step: ComponentConfig, index: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const slots = useSlots()

useSparkComponent(props.config ?? { type: 'r-steps' })

const stepConfigs = computed(() =>
  (props.config?.children ?? props.sparkChildren ?? []).filter(child => child.type === 'r-step')
)

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
  config: computed(() => props.config),
  toolbar: computed(() => props.toolbar),
  toolbarPosition: computed(() => props.toolbarPosition),
  toolbarClass: computed(() => props.toolbarClass),
  modelPermission: computed(() => undefined),
  slots,
})

const activeStepIndex = computed(() => {
  const index = stepConfigs.value.findIndex((step, idx) => getStepName(step, idx) === activeStepName.value)
  return index >= 0 ? index : 0
})

const activeStep = computed(() => stepConfigs.value[activeStepIndex.value])

function getStepChildren(step: ComponentConfig): ComponentConfig[] {
  return step.children ?? []
}

function getStepName(step: ComponentConfig, index: number): string | number {
  const value = step.props?.['name'] ?? step.props?.['value'] ?? step.id
  return typeof value === 'string' || typeof value === 'number' ? value : `step-${index}`
}

function getStepKey(step: ComponentConfig, index: number): string | number {
  return step.id ?? getStepName(step, index)
}

function getStepTitle(step: ComponentConfig, index: number): string {
  const value = step.props?.['title'] ?? step.props?.['label']
  return typeof value === 'string' && value.trim().length > 0 ? value : `步骤${index + 1}`
}

function getStepDescription(step: ComponentConfig): string {
  return typeof step.props?.['description'] === 'string' ? step.props['description'] as string : ''
}

function getStepStatus(step: ComponentConfig): string | undefined {
  return typeof step.props?.['status'] === 'string' ? step.props['status'] as string : undefined
}

function getStepBodyClass(step: ComponentConfig): string {
  return typeof step.props?.['bodyClass'] === 'string' ? step.props['bodyClass'] as string : ''
}

function getStepGridStyle(step: ComponentConfig): CSSProperties {
  const columns = normalizeSpan(step.props?.['gridColumns'], 24)
  const autoRows = typeof step.props?.['gridAutoRows'] === 'string' && step.props['gridAutoRows'].trim().length > 0
    ? step.props['gridAutoRows'] as string
    : 'minmax(32px, auto)'
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: normalizeGridGap(step.props?.['gridGap']),
    gridAutoRows: autoRows,
    alignItems: 'start',
  }
}

function getStepChildGridStyle(child: ComponentConfig): CSSProperties {
  const colSpan = normalizeSpan(child.props?.['colSpan'] ?? child.props?.['gridColSpan'] ?? child.props?.['span'], 24)
  const rowSpan = normalizeSpan(child.props?.['rowSpan'] ?? child.props?.['gridRowSpan'], 1)
  return {
    gridColumn: `span ${colSpan} / span ${colSpan}`,
    gridRow: `span ${rowSpan} / span ${rowSpan}`,
    minWidth: 0,
  }
}

function activateStep(index: number): void {
  const step = stepConfigs.value[index]
  if (!step) return
  const nextValue = getStepName(step, index)
  activeStepName.value = nextValue
  emit('update:modelValue', nextValue)
  props.onStepChange?.(nextValue, step, index)
}

function getToolbarSlotScope() {
  return createToolbarSlotScope({
    dataSource: undefined,
    modelPermission: undefined,
  }, {
    activeStepName: activeStepName.value,
    activeStepIndex: activeStepIndex.value,
    steps: stepConfigs.value,
  })
}

function getStepSlotScope(step: ComponentConfig, index: number) {
  return {
    step,
    stepIndex: index,
    stepName: getStepName(step, index),
    stepTitle: getStepTitle(step, index),
    activeStepName: activeStepName.value,
  }
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