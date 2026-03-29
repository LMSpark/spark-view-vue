<!--
/**
 * @skill r-step
 * @description 步骤子组件，双模式（header 渲染步骤头，content 渲染内容网格）；自行解析 title/description/status/disabled 等语义 props
 * @input { props: { title?: string, description?: string, status?: string, disabled?: boolean, name?: string|number, bodyClass?: string, gridColumns?: number } }
 */
-->
<template>
  <el-step
    v-if="mode === 'header'"
    :title="stepTitle"
    :description="stepDescription"
    :status="stepStatus"
    :disabled="stepDisabled"
    @click="emit('activate', index)"
  />

  <div v-else :class="['renderer-steps-content-body', stepBodyClass]" :style="stepGridStyle">
    <SparkChildrenBridge :spark-children="stepChildren" :parent-context="context">
      <template #spark="{ child, index }">
        <div
          :key="nodeId(child) ?? `r-step-child-${index}`"
          class="renderer-steps-content-grid-item"
          :style="getStepChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot />
    </SparkChildrenBridge>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkChildrenBridge, SparkComponentRenderer, useSparkComponent } from '../../internal'
import { nodeId, type SparkNode } from '../../internal'
import { useCompositeItemGrid } from '../layout/useCompositeItemGrid'

interface Props {
  type?: string
  props?: Record<string, unknown>
  children?: SparkNode['children']
  id?: string
  title?: string
  label?: string
  description?: string
  status?: string
  disabled?: boolean
  bodyClass?: string
  gridColumns?: number | string
  gridAutoRows?: string
  gridGap?: number | string
  index: number
  mode: 'header' | 'content'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-step',
})

const emit = defineEmits<{
  activate: [index: number]
}>()

const { context } = useSparkComponent(props)

const {
  contentChildren: stepChildren,
  contentBodyClass: stepBodyClass,
  contentGridStyle: stepGridStyle,
  getContentChildGridStyle: getStepChildGridStyle,
} = useCompositeItemGrid({
  children: () => props.children,
  bodyClass: () => props.bodyClass,
  gridColumns: () => props.gridColumns,
  gridAutoRows: () => props.gridAutoRows,
  gridGap: () => props.gridGap,
})

const stepTitle = computed(() => {
  const value = props.title ?? props.label
  return typeof value === 'string' && value.trim().length > 0 ? value : `步骤${props.index + 1}`
})

const stepDescription = computed(() => {
  const description = props.description
  return typeof description === 'string' ? description : ''
})

const stepStatus = computed<string | undefined>(() => {
  const status = props.status
  return typeof status === 'string' ? status : undefined
})

const stepDisabled = computed(() => props.disabled === true)
</script>
