<template>
  <el-tab-pane
    :label="paneLabel"
    :name="paneName"
    :disabled="paneDisabled"
    :lazy="paneLazy"
    :closable="paneClosable"
  >
    <div :class="['renderer-tabs-pane-body', paneBodyClass]" :style="paneGridStyle">
      <div
        v-for="(child, index) in paneChildren"
        :key="nodeId(child) ?? `r-tab-pane-child-${index}`"
        class="renderer-tabs-pane-grid-item"
        :style="getPaneChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot />
    </div>
  </el-tab-pane>
</template>

<script setup lang="ts">
/**
 * @skill r-tab-pane
 * @description 标签页面板（r-tabs 内部），基于 el-tab-pane 在标签页体内以 24 列网格渲染子组件。
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

useSparkComponent(props)

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
