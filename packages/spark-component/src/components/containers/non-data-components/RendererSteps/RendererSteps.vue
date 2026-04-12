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
          :index="index"
          mode="header"
          :type="step.type"
          v-bind="getStepComponentProps(step)"
          @activate="activateStep"
        />
      </el-steps>

      <RendererStepItem
        v-if="activeStep"
        :index="activeStepIndex"
        mode="content"
        :type="activeStep.type"
        v-bind="getStepComponentProps(activeStep)"
      >
        <slot v-if="!hasStepChildren(activeStep)" v-bind="getStepSlotScope(activeStep, activeStepIndex)" />
      </RendererStepItem>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-steps
 * @description 步骤条容器，基于 el-steps 管理多步骤流程的激活状态，支持工具栏和步骤内容切换。
 * @category container
 * @notes children 内放 r-step
 */
import { computed } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, nodeInputProp, type SparkNode } from '../../../internal'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import type { ToolbarNode } from '../RendererToolbar.types'
import RendererStepItem from '../RendererStepItem.vue'
import type { RendererStepsApi } from './types'
import { createRendererStepsZeroCode } from './zero-code'
import { useDefaultedSelection } from '../state'

interface Props extends SparkNode {
  /** 子节点（步骤配置） */
  children?: SparkNode[]
  /** 结构化工具栏 */
  toolbar?: ToolbarNode
  /** 当前步骤 */
  modelValue?: string | number
  /** 步骤切换回调 */
  onStepChange?: (value: string | number, step: SparkNode, index: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-steps',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const { registerApi } = useSparkPageComponent(props)

// 子节点类型已由绑定层从 children 提升为 props（toolbar）
const contentChildren = computed(() => props.children ?? [])

const stepConfigs = computed(() =>
  getSparkNodeChildren(contentChildren.value).filter(child => child.type === 'r-step')
)
const activeStepName = useDefaultedSelection({
  modelValue: computed(() => props.modelValue),
  items: stepConfigs,
  getValue: getStepName,
})

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
    toolbarPosition: computed(() => props.toolbar?.props?.position as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.toolbar?.props?.class),
  modelPermission: computed(() => undefined),
})

const activeStepIndex = computed(() => {
  const index = stepConfigs.value.findIndex((step, idx) => getStepName(step, idx) === activeStepName.value)
  return index >= 0 ? index : 0
})

const activeStep = computed(() => stepConfigs.value[activeStepIndex.value])

function hasStepChildren(step: SparkNode): boolean {
  return getSparkNodeChildren(step.children).length > 0
}

function getStepName(step: SparkNode, index: number): string | number {
  const value = nodeInputProp(step, 'name') ?? nodeInputProp(step, 'value') ?? nodeId(step)
  return typeof value === 'string' || typeof value === 'number' ? value : `step-${index}`
}

function getStepKey(step: SparkNode, index: number): string | number {
  return nodeId(step) ?? getStepName(step, index)
}

function getStepComponentProps(step: SparkNode): Record<string, unknown> {
  const resolvedId = nodeId(step)
  return {
    ...(resolvedId !== undefined ? { id: resolvedId } : {}),
    ...(step.children !== undefined ? { children: step.children } : {}),
    ...(step.props ?? {}),
  }
}

// ── r-steps 包装 API ─────────────────────────────────────────────────────

const {
  stepsApi,
  activateStep,
}: {
  stepsApi: RendererStepsApi
  activateStep: (index: number) => void
} = createRendererStepsZeroCode({
  emit,
  stepConfigs,
  activeStepName,
  activeStepIndex,
  getStepName,
  onStepChange: props.onStepChange,
})

registerApi(stepsApi)

defineExpose(stepsApi)

function getStepSlotScope(step: SparkNode, index: number) {
  return {
    step,
    stepIndex: index,
    stepName: getStepName(step, index),
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

.renderer-steps-content-body {
  width: 100%;
  min-width: 0;
  margin-top: 16px;
}

.renderer-steps-content-grid-item {
  min-width: 0;
}
</style>
