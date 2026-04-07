<!--
/**
 * @skill r-tab-pane
 * @description 标签页面板子组件，自行解析 label/name/disabled 等语义 props；内容区采用 24 列 CSS Grid
 * @input { props: { label?: string, name?: string|number, disabled?: boolean, lazy?: boolean, closable?: boolean, bodyClass?: string, gridColumns?: number } }
 */
-->
<template>
  <el-tab-pane
    :label="paneLabel"
    :name="paneName"
    :disabled="paneDisabled"
    :lazy="paneLazy"
    :closable="paneClosable"
  >
    <div :class="['renderer-tabs-pane-body', paneBodyClass]" :style="paneGridStyle">
      <SparkChildrenBridge :spark-children="paneChildren" :parent-context="context">
        <template #spark="{ child, index }">
          <div
            :key="nodeId(child) ?? `r-tab-pane-child-${index}`"
            class="renderer-tabs-pane-grid-item"
            :style="getPaneChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </template>
        <slot />
      </SparkChildrenBridge>
    </div>
  </el-tab-pane>
</template>

<script setup lang="ts">
/**
 * @skill-description 标签页面板（r-tabs 内部），基于 el-tab-pane 在标签页体内以 24 列网格渲染子组件。
 */
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
  value?: string | number
  label?: string
  title?: string
  disabled?: boolean
  lazy?: boolean
  closable?: boolean
  bodyClass?: string
  gridColumns?: number | string
  gridAutoRows?: string
  gridGap?: number | string
  index: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tab-pane',
})

const { context } = useSparkComponent(props)

const {
  contentChildren: paneChildren,
  contentBodyClass: paneBodyClass,
  contentGridStyle: paneGridStyle,
  getContentChildGridStyle: getPaneChildGridStyle,
} = useCompositeItemGrid({
  children: () => props.children,
  bodyClass: () => props.bodyClass,
  gridColumns: () => props.gridColumns,
  gridAutoRows: () => props.gridAutoRows,
  gridGap: () => props.gridGap,
})

const paneName = computed<string | number>(() => {
  const value = props.name ?? props.value ?? props.id
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${props.index}`
})

const paneLabel = computed(() => {
  const value = props.label ?? props.title
  return typeof value === 'string' && value.trim().length > 0 ? value : `标签页${props.index + 1}`
})

const paneDisabled = computed(() => props.disabled === true)
const paneLazy = computed(() => props.lazy === true)
const paneClosable = computed(() => props.closable === true)
</script>
