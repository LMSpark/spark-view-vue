<!--
/**
 * @skill r-collapse-item
 * @description 折叠项子组件，自行解析 title/name/disabled 等语义 props；内容区采用 24 列 CSS Grid
 * @input { props: { title?: string, name?: string|number, disabled?: boolean, bodyClass?: string, gridColumns?: number } }
 */
-->
<template>
  <el-collapse-item
    :name="itemName"
    :title="itemTitle"
    :disabled="itemDisabled"
  >
    <div :class="['renderer-collapse-item-body', itemBodyClass]" :style="itemGridStyle">
      <SparkChildrenBridge :spark-children="itemChildren" :parent-context="context">
        <template #spark="{ child, index }">
          <div
            :key="nodeId(child) ?? `r-collapse-item-child-${index}`"
            class="renderer-collapse-item-grid-item"
            :style="getItemChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </template>
        <slot />
      </SparkChildrenBridge>
    </div>
  </el-collapse-item>
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
  name?: string | number
  title?: string
  label?: string
  disabled?: boolean
  bodyClass?: string
  gridColumns?: number | string
  gridAutoRows?: string
  gridGap?: number | string
  index: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-collapse-item',
})

const { context } = useSparkComponent(props)

const {
  contentChildren: itemChildren,
  contentBodyClass: itemBodyClass,
  contentGridStyle: itemGridStyle,
  getContentChildGridStyle: getItemChildGridStyle,
} = useCompositeItemGrid({
  children: () => props.children,
  bodyClass: () => props.bodyClass,
  gridColumns: () => props.gridColumns,
  gridAutoRows: () => props.gridAutoRows,
  gridGap: () => props.gridGap,
})

const itemName = computed<string | number>(() => {
  const value = props.name ?? props.id
  return typeof value === 'string' || typeof value === 'number' ? value : `collapse-${props.index}`
})

const itemTitle = computed(() => {
  const value = props.title ?? props.label
  return typeof value === 'string' && value.trim().length > 0 ? value : `分组${props.index + 1}`
})

const itemDisabled = computed(() => props.disabled === true)
</script>
