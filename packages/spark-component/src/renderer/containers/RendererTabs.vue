<!--
/**
 * @skill r-tabs
 * @description 标签页容器，内部使用 r-tab-pane 定义面板；每个面板内容默认采用 24 列 CSS Grid
 * @input { props: { modelValue?: string|number, toolbar?: SparkNode[], toolbarPosition?: 'top'|'bottom'|'left'|'right' } }
 * @example { "type": "r-tabs", "children": [{ "type": "r-tab-pane", "props": { "label": "基本信息", "name": "base" }, "children": [] }] }
 */
-->
<template>
  <div :class="['renderer-tabs-layout', `renderer-tabs-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tabs-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-tabs-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
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
          <el-tab-pane
            v-for="(pane, index) in paneConfigs"
            :key="getPaneKey(pane, index)"
            :label="getPaneLabel(pane, index)"
            :name="getPaneName(pane, index)"
            :disabled="getPaneDisabled(pane)"
            :lazy="getPaneLazy(pane)"
            :closable="getPaneClosable(pane)"
          >
            <div :class="['renderer-tabs-pane-body', getPaneBodyClass(pane)]" :style="getPaneGridStyle(pane)">
              <template v-if="getPaneChildren(pane).length">
                <div
                  v-for="(child, childIndex) in getPaneChildren(pane)"
                  :key="child.id ?? `r-tab-pane-child-${childIndex}`"
                  class="renderer-tabs-pane-grid-item"
                  :style="getPaneChildGridStyle(child)"
                >
                  <SparkComponentRenderer :config="child" />
                </div>
              </template>
              <slot
                v-else
                v-bind="getPaneSlotScope(pane, index)"
              />
            </div>
          </el-tab-pane>
        </template>
        <slot v-else />
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import { useContainerToolbar } from './useContainerToolbar'
import { createToolbarSlotScope } from './useContainerSlotScopes'
import { normalizeGridGap, normalizeSpan } from './useContainerGrid'

interface TabsClickEvent {
  paneName?: string | number
  [key: string]: unknown
}

interface Props {
  /** SPARK 配置驱动 */
  config?: SparkNode
  /** bindRules 提取的子组件配置 */
  sparkChildren?: SparkNode[]
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
  /** 当前激活标签页 */
  modelValue?: string | number
  /** 标签页切换回调 */
  onTabChange?: (name: string | number) => void
  /** 标签页点击回调 */
  onTabClick?: (pane: TabsClickEvent, event: Event) => void
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const slots = useSlots()

useSparkComponent(props.config ?? { type: 'r-tabs' })

const paneConfigs = computed(() =>
  (props.config?.children ?? props.sparkChildren ?? []).filter(child => child.type === 'r-tab-pane')
)

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
  config: computed(() => props.config),
  toolbar: computed(() => props.toolbar),
  toolbarPosition: computed(() => props.toolbarPosition),
  toolbarClass: computed(() => props.toolbarClass),
  modelPermission: computed(() => undefined),
  slots,
})

function getPaneChildren(pane: SparkNode): SparkNode[] {
  return pane.children ?? []
}

function getPaneName(pane: SparkNode, index: number): string | number {
  const value = pane.props?.['name'] ?? pane.props?.['value'] ?? pane.id
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${index}`
}

function getPaneKey(pane: SparkNode, index: number): string | number {
  return pane.id ?? getPaneName(pane, index)
}

function getPaneLabel(pane: SparkNode, index: number): string {
  const value = pane.props?.['label'] ?? pane.props?.['title']
  return typeof value === 'string' && value.trim().length > 0 ? value : `标签页${index + 1}`
}

function getPaneDisabled(pane: SparkNode): boolean {
  return pane.props?.['disabled'] === true
}

function getPaneLazy(pane: SparkNode): boolean {
  return pane.props?.['lazy'] === true
}

function getPaneClosable(pane: SparkNode): boolean {
  return pane.props?.['closable'] === true
}

function getPaneBodyClass(pane: SparkNode): string {
  return typeof pane.props?.['bodyClass'] === 'string' ? pane.props['bodyClass'] as string : ''
}

function getPaneGridStyle(pane: SparkNode): CSSProperties {
  const columns = normalizeSpan(pane.props?.['gridColumns'], 24)
  const autoRows = typeof pane.props?.['gridAutoRows'] === 'string' && pane.props['gridAutoRows'].trim().length > 0
    ? pane.props['gridAutoRows'] as string
    : 'minmax(32px, auto)'

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: normalizeGridGap(pane.props?.['gridGap']),
    gridAutoRows: autoRows,
    alignItems: 'start',
  }
}

function getPaneChildGridStyle(child: SparkNode): CSSProperties {
  const colSpan = normalizeSpan(child.props?.['colSpan'] ?? child.props?.['gridColSpan'] ?? child.props?.['span'], 24)
  const rowSpan = normalizeSpan(child.props?.['rowSpan'] ?? child.props?.['gridRowSpan'], 1)
  return {
    gridColumn: `span ${colSpan} / span ${colSpan}`,
    gridRow: `span ${rowSpan} / span ${rowSpan}`,
    minWidth: 0,
  }
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

function getToolbarSlotScope() {
  return createToolbarSlotScope({
    dataSource: undefined,
    modelPermission: undefined,
  }, {
    activeName: currentActiveName.value,
    panes: paneConfigs.value,
  })
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