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
      <el-steps :active="activeStepIndex">
        <SparkComponentRenderer
          v-for="(step, index) in stepConfigs"
          :key="getStepKey(step, index)"
          :config="createStepRendererConfig(step, index, 'header')"
        />
      </el-steps>

      <SparkComponentRenderer
        v-if="activeStep"
        :config="createStepRendererConfig(activeStep, activeStepIndex, 'content')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-steps
 * @description 步骤条容器，支持工具栏和步骤内容切换。
 * @category container
 * @notes children 内放 r-step
 */
import { computed } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, nodeInputProp, nodeInputProps, type SparkNode } from '../../../internal'
import { useContainerToolbar } from '../../runtime/container-ui'
import type { RendererStepsApi } from './types'
import { createRendererStepsZeroCode } from './zero-code'
import { useDefaultedSelection } from '../state'
import type { RStepsProps } from './RendererSteps.props'

const props = withDefaults(defineProps<RStepsProps>(), {
  type: 'r-steps',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const { registerApi } = useSparkPageComponent(props)

// 工具栏优先通过 props.toolbar 输入；children 作为步骤项输入。
const stepConfigs = computed(() => getSparkNodeChildren(props.children))
const activeStepName = useDefaultedSelection({
  value: computed(() => props.modelValue),
  items: stepConfigs,
  getValue: getStepName,
})

const { visibleToolbarConfigs, toolbarPositionValue, toolbarClassValue, showToolbar } =
  useContainerToolbar({ toolbarNode: () => props.toolbar })

const activeStepIndex = computed(() => {
  const index = stepConfigs.value.findIndex((step, idx) => getStepName(step, idx) === activeStepName.value)
  return index >= 0 ? index : 0
})

const activeStep = computed(() => stepConfigs.value[activeStepIndex.value])

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
    ...nodeInputProps(step),
  }
}

function createStepRendererConfig(step: SparkNode, index: number, mode: 'header' | 'content'): SparkNode {
  return {
    type: 'r-step',
    props: {
      ...getStepComponentProps(step),
      index,
      mode,
      ...(mode === 'header' ? { onActivate: activateStep } : {}),
    },
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
