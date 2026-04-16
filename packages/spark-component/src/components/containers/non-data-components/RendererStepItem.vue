<template>
  <el-step
    v-if="mode === 'header'"
    :title="stepTitle"
    :description="stepDescription"
    :status="stepStatus"
    :disabled="stepDisabled"
    @click="emit('activate', index)"
  />

  <RendererHostScope v-else type="r-step-item-field-scope" :host="stepItemFieldHost">
    <div :class="['renderer-steps-content-body', stepBodyClass]" :style="stepGridStyle">
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
  </RendererHostScope>
</template>

<script setup lang="ts">
/**
 * @skill r-step-item
 * @description 步骤项组件（r-steps 内部），双模式渲染：步骤头部与步骤内容区（24 列网格）。
 * @category internal
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../../internal'
import { nodeId, type SparkNode } from '../../internal'
import RendererHostScope from '../support/RendererHostScope.vue'
import type { SparkComponentHost } from '../../internal'
import { useCompositeItemGrid } from '../layout/useCompositeItemGrid'

interface Props {
  type?: string
  /** 原始属性包（透传） */
  props?: { [key: string]: unknown }
  children?: SparkNode['children']
  id?: string
  /** 步骤唯一标识 */
  name?: string | number
  /** 步骤值（name 别名） */
  value?: string | number
  /** 步骤标题 */
  title?: string
  /** 步骤标签（title 别名） */
  label?: string
  /** 步骤描述文本 */
  description?: string
  /** 步骤状态 */
  status?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 步骤体自定义 class */
  bodyClass?: string
  /** CSS Grid 列数 */
  gridColumns?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 栅格间距 */
  gridGap?: number | string
  /** 在父容器中的位置序号 */
  index: number
  /** 渲染模式：步骤头部或内容区 */
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

const stepItemFieldHost: SparkComponentHost = {
  fieldMode: 'detail',
}
</script>
