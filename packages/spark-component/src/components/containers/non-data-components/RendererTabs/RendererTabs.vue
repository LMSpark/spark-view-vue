<!--
/**
 * @skill r-tabs
 * @description 标签页容器，内部使用 r-tab-pane 定义面板；支持 `r-toolbar` wrapper 工具栏，每个面板内容默认采用 24 列 CSS Grid
 * @input { props: { modelValue?: string|number }, children?: [{ type: 'r-toolbar'|'r-tab-pane', props?: Record<string, unknown>, children?: SparkNode[] }] }
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
            :index="index"
            :type="pane.type"
            v-bind="getPaneComponentProps(pane)"
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
/**
 * @skill-description 标签页容器，基于 el-tabs 管理多标签切换和激活状态，支持工具栏 dock。
 */
import { computed } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, nodeInputProp, type SparkNode } from '../../../internal'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererTabPane from '../RendererTabPane.vue'
import type { RendererTabsApi } from './types'
import { createRendererTabsZeroCode } from './zero-code'
import { useDefaultedSelection } from '../state'

interface TabsClickEvent {
  paneName?: string | number
  [key: string]: unknown
}

interface Props extends SparkNode {
  /** 子节点（标签面板配置） */
  children?: SparkNode[]
  /** 结构化工具栏 dock */
  toolbar?: SparkNode
  /** 当前激活标签页 */
  modelValue?: string | number
  /** 标签页切换回调 */
  onTabChange?: (name: string | number) => void
  /** 标签页点击回调 */
  onTabClick?: (pane: TabsClickEvent, event: Event) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tabs',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const { registerApi } = useSparkPageComponent(props)

// Dock 节点已由绑定层从 children 提升为 props（toolbar）
const contentChildren = computed(() => props.children ?? [])

const paneConfigs = computed(() =>
  getSparkNodeChildren(contentChildren.value).filter(child => child.type === 'r-tab-pane')
)
const currentActiveName = useDefaultedSelection({
  modelValue: computed(() => props.modelValue),
  items: paneConfigs,
  getValue: getPaneName,
})

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
    toolbarPosition: computed(() => props.toolbar?.props?.['position'] as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.toolbar?.props?.['class'] as string | undefined),
  modelPermission: computed(() => undefined),
})

// ── r-tabs 包装 API ──────────────────────────────────────────────────────

const {
  tabsApi,
  handleModelUpdate,
  handleTabChange,
}: {
  tabsApi: RendererTabsApi
  handleModelUpdate: (value: string | number) => void
  handleTabChange: (value: string | number) => void
} = createRendererTabsZeroCode({
  emit,
  currentActiveName,
  paneConfigs,
  getPaneName,
  onTabChange: props.onTabChange,
})

registerApi(tabsApi)

defineExpose(tabsApi)

function hasPaneChildren(pane: SparkNode): boolean {
  return getSparkNodeChildren(pane.children).length > 0
}

function getPaneName(pane: SparkNode, index: number): string | number {
  const value = nodeInputProp(pane, 'name') ?? nodeInputProp(pane, 'value') ?? nodeId(pane)
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${index}`
}

function getPaneKey(pane: SparkNode, index: number): string | number {
  return nodeId(pane) ?? getPaneName(pane, index)
}

function getPaneComponentProps(pane: SparkNode): Record<string, unknown> {
  const resolvedId = nodeId(pane)
  return {
    ...(resolvedId !== undefined ? { id: resolvedId } : {}),
    ...(pane.children !== undefined ? { children: pane.children } : {}),
    ...(pane.props ?? {}),
  }
}

function handleTabClick(pane: TabsClickEvent, event: Event): void {
  props.onTabClick?.(pane, event)
}

function getPaneSlotScope(pane: SparkNode, index: number) {
  return {
    pane,
    paneIndex: index,
    paneName: getPaneName(pane, index),
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
