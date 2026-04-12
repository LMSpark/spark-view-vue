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
    <div
      v-for="(child, index) in stepChildren"
      :key="nodeId(child) ?? `r-step-child-${index}`"
      class="renderer-steps-content-grid-item"
      :style="getStepChildGridStyle(child)"
    >
      <SparkComponentRenderer :config="child" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-step-item
 * @description 步骤项组件（r-steps 内部），双模式渲染：步骤头部（el-step）和步骤内容区（24 列网格）。
 * @category internal
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../../internal'
import { nodeId, type SparkNode } from '../../internal'
import { useCompositeItemGrid } from '../layout/useCompositeItemGrid'

interface Props {
  type?: string
  props?: { [key: string]: unknown }
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

useSparkComponent(props)

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
