<!--
/**
 * @skill r-tabs
 * @description 标签页容器，内部使用 r-tab-pane 定义面板；支持 dock 分区工具栏，每个面板内容默认采用 24 列 CSS Grid
 * @input { props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } }, modelValue?: string|number } }
 * @example { "type": "r-tabs", "children": [{ "type": "r-tab-pane", "props": { "label": "基本信息", "name": "base" }, "children": [] }] }
 */
-->
<template>
  <div :class="['renderer-tabs-layout', `renderer-tabs-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tabs-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-tabs-toolbar-${index}`"
        :config="action"
      />
    </div>

    <div class="renderer-tabs-main">
      <el-tabs
        v-bind="$attrs"
        :model-value="currentActiveName"
        @update:model-value="handleModelUpdate"
        @tab-click="handleTabClick"
        @tab-change="handleTabChange"
      >
        <template v-if="paneConfigs.length">
          <RendererTabPane
            v-for="(pane, index) in paneConfigs"
            :key="getPaneKey(pane, index)"
            :config="pane"
            :index="index"
          >
            <slot v-if="!hasPaneChildren(pane)" v-bind="getPaneSlotScope(pane, index)" />
          </RendererTabPane>
        </template>
        <slot v-else />
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSparkComponent } from '../_pkg'
import { getDockedChildren, nodeId, nodeInputProp, type SparkNode } from '../_pkg'
import type { ContainerDocks } from '../../types'
import { useContainerToolbar } from './useContainerToolbar'
import RendererTabPane from './RendererTabPane.vue'
import type { RendererTabsApi } from '../_pkg'

interface TabsClickEvent {
  paneName?: string | number
  [key: string]: unknown
}

interface Props {
  /** 子节点（标签面板配置） */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
  /** 当前激活标签页 */
  modelValue?: string | number
  /** 标签页切换回调 */
  onTabChange?: (name: string | number) => void
  /** 标签页点击回调 */
  onTabClick?: (pane: TabsClickEvent, event: Event) => void
}

const props = withDefaults(defineProps<Props>(), {
  docks: () => ({}),
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const { registerApi } = useSparkComponent({ type: 'r-tabs' })

const paneConfigs = computed(() =>
  getDockedChildren(props.children).filter(child => child.type === 'r-tab-pane')
)
const dockedToolbar = computed(() => getDockedChildren(props.children, 'toolbar'))

const currentActiveName = ref<string | number | undefined>(props.modelValue)

watch(() => props.modelValue, (value) => {
  currentActiveName.value = value
}, { immediate: true })

watch(paneConfigs, (panes) => {
  if (currentActiveName.value !== undefined) return
  const firstPane = panes[0]
  if (!firstPane) return
  currentActiveName.value = getPaneName(firstPane, 0)
}, { immediate: true })

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => dockedToolbar.value),
  toolbarPosition: computed(() => props.docks?.toolbar?.position),
  toolbarClass: computed(() => props.docks?.toolbar?.class),
  modelPermission: computed(() => undefined),
})

// ── r-tabs 包装 API ──────────────────────────────────────────────────────


const tabsApi: RendererTabsApi = {
  getActiveTab() {
    return currentActiveName.value
  },
  setActiveTab(name) {
    currentActiveName.value = name
    emit('update:modelValue', name)
  },
  getPaneNames() {
    return paneConfigs.value.map((pane, index) => getPaneName(pane, index))
  },
  getPaneCount() {
    return paneConfigs.value.length
  },
}

registerApi(tabsApi)

defineExpose(tabsApi)

function hasPaneChildren(pane: SparkNode): boolean {
  return Array.isArray(pane.children) && pane.children.length > 0
}

function getPaneName(pane: SparkNode, index: number): string | number {
  const value = nodeInputProp(pane, 'name') ?? nodeInputProp(pane, 'value') ?? nodeId(pane)
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${index}`
}

function getPaneKey(pane: SparkNode, index: number): string | number {
  return nodeId(pane) ?? getPaneName(pane, index)
}

function getPaneLabel(pane: SparkNode, index: number): string {
  const value = nodeInputProp(pane, 'label') ?? nodeInputProp(pane, 'title')
  return typeof value === 'string' && value.trim().length > 0 ? value : `标签页${index + 1}`
}

function handleModelUpdate(value: string | number): void {
  currentActiveName.value = value
  emit('update:modelValue', value)
}

function handleTabChange(value: string | number): void {
  currentActiveName.value = value
  props.onTabChange?.(value)
}

function handleTabClick(pane: TabsClickEvent, event: Event): void {
  props.onTabClick?.(pane, event)
}

function getPaneSlotScope(pane: SparkNode, index: number) {
  return {
    pane,
    paneIndex: index,
    paneName: getPaneName(pane, index),
    paneLabel: getPaneLabel(pane, index),
    activeName: currentActiveName.value,
  }
}
</script>

<style scoped>
.renderer-tabs-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-tabs-layout--top,
.renderer-tabs-layout--bottom {
  flex-direction: column;
}

.renderer-tabs-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-tabs-layout--right {
  flex-direction: row-reverse;
}

.renderer-tabs-main {
  min-width: 0;
  flex: 1;
}

.renderer-tabs-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-tabs-layout--left .renderer-tabs-toolbar,
.renderer-tabs-layout--right .renderer-tabs-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-tabs-pane-body {
  width: 100%;
  min-width: 0;
  padding-top: 8px;
}

.renderer-tabs-pane-grid-item {
  min-width: 0;
}
</style>