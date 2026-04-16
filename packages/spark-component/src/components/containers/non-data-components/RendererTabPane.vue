<template>
  <el-tab-pane
    :label="paneLabel"
    :name="paneName"
    :disabled="paneDisabled"
    :lazy="paneLazy"
    :closable="paneClosable"
  >
    <RendererHostScope type="r-tab-pane-field-scope" :host="tabPaneFieldHost">
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
    </RendererHostScope>
  </el-tab-pane>
</template>

<script setup lang="ts">
/**
 * @skill r-tab-pane
 * @description 标签页面板（r-tabs 内部）。
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
  /** 标签页唯一标识 */
  name?: string | number
  /** 标签页值 */
  value?: string | number
  /** 标签页标签文本 */
  label?: string
  /** 标签页标题（label 别名） */
  title?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否延迟加载 */
  lazy?: boolean
  /** 是否可关闭 */
  closable?: boolean
  /** 标签页体自定义 class */
  bodyClass?: string
  /** CSS Grid 列数 */
  gridColumns?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 栅格间距 */
  gridGap?: number | string
  /** 在父容器中的位置序号 */
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

const tabPaneFieldHost: SparkComponentHost = {
  fieldMode: 'detail',
}
</script>

