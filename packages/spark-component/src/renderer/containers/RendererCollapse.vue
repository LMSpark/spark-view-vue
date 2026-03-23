<!--
/**
 * @skill r-collapse
 * @description 折叠面板容器，内部使用 r-collapse-item 定义分组；每个折叠项内容默认采用 24 列 CSS Grid
 * @input { props: { modelValue?: string|number|Array<string|number>, toolbar?: SparkNode[] } }
 * @example { "type": "r-collapse", "children": [{ "type": "r-collapse-item", "props": { "title": "基本信息", "name": "base" }, "children": [] }] }
 */
-->
<template>
  <div :class="['renderer-collapse-layout', `renderer-collapse-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-collapse-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-collapse-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
    </div>

    <div class="renderer-collapse-main">
      <el-collapse
        v-bind="$attrs"
        :model-value="currentModelValue"
        @update:model-value="handleModelUpdate"
        @change="handleChange"
      >
        <template v-if="itemConfigs.length">
          <el-collapse-item
            v-for="(item, index) in itemConfigs"
            :key="getItemKey(item, index)"
            :name="getItemName(item, index)"
            :title="getItemTitle(item, index)"
            :disabled="getItemDisabled(item)"
          >
            <div :class="['renderer-collapse-item-body', getItemBodyClass(item)]" :style="getItemGridStyle(item)">
              <template v-if="getItemChildren(item).length">
                <div
                  v-for="(child, childIndex) in getItemChildren(item)"
                  :key="child.id ?? `r-collapse-item-child-${childIndex}`"
                  class="renderer-collapse-grid-item"
                  :style="getItemChildGridStyle(child)"
                >
                  <SparkComponentRenderer :config="child" />
                </div>
              </template>
              <slot
                v-else
                v-bind="getItemSlotScope(item, index)"
              />
            </div>
          </el-collapse-item>
        </template>
        <slot v-else />
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, useSlots, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer, SPARK_NODE_CONFIG_KEY } from '../_pkg'
import type { SparkNode } from '../_pkg'
import { useContainerToolbar } from './useContainerToolbar'
import { createToolbarSlotScope } from './useContainerSlotScopes'
import { normalizeGridGap, normalizeSpan } from './useContainerGrid'
import type { RendererCollapseApi } from '../_pkg'

type CollapseValue = string | number | Array<string | number>

interface Props {
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
  /** 当前展开的面板 */
  modelValue?: CollapseValue
  /** 展开/折叠切换回调 */
  onChange?: (value: CollapseValue) => void
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: CollapseValue]
}>()

const slots = useSlots()
const nodeConfig = inject(SPARK_NODE_CONFIG_KEY, undefined)

const { registerApi } = useSparkComponent(nodeConfig ?? { type: 'r-collapse' })

const itemConfigs = computed(() =>
  (nodeConfig?.children ?? []).filter(child => child.type === 'r-collapse-item')
)

const currentModelValue = ref<CollapseValue | undefined>(props.modelValue)

watch(() => props.modelValue, (value) => {
  currentModelValue.value = value
}, { immediate: true })

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  config: computed(() => nodeConfig),
  toolbar: computed(() => props.toolbar),
  toolbarPosition: computed(() => props.toolbarPosition),
  toolbarClass: computed(() => props.toolbarClass),
  modelPermission: computed(() => undefined),
  slots,
})

// ── r-collapse 包装 API ──────────────────────────────────────────────────


const collapseApi: RendererCollapseApi = {
  getExpandedItems() {
    return currentModelValue.value
  },
  setExpandedItems(value) {
    currentModelValue.value = value
    emit('update:modelValue', value)
  },
  expandAll() {
    const allNames = itemConfigs.value.map((item, index) => getItemName(item, index))
    currentModelValue.value = allNames
    emit('update:modelValue', allNames)
  },
  collapseAll() {
    currentModelValue.value = []
    emit('update:modelValue', [])
  },
  toggleItem(name) {
    const current = Array.isArray(currentModelValue.value) ? currentModelValue.value : []
    const next = current.includes(name)
      ? current.filter(n => n !== name)
      : [...current, name]
    currentModelValue.value = next
    emit('update:modelValue', next)
  },
  isItemExpanded(name) {
    const current = currentModelValue.value
    if (Array.isArray(current)) return current.includes(name)
    return current === name
  },
}

registerApi(collapseApi)

defineExpose(collapseApi)

function getItemChildren(item: SparkNode): SparkNode[] {
  return item.children ?? []
}

function getItemName(item: SparkNode, index: number): string | number {
  const value = item.props?.['name'] ?? item.id
  return typeof value === 'string' || typeof value === 'number' ? value : `collapse-${index}`
}

function getItemKey(item: SparkNode, index: number): string | number {
  return item.id ?? getItemName(item, index)
}

function getItemTitle(item: SparkNode, index: number): string {
  const value = item.props?.['title'] ?? item.props?.['label']
  return typeof value === 'string' && value.trim().length > 0 ? value : `分组${index + 1}`
}

function getItemDisabled(item: SparkNode): boolean {
  return item.props?.['disabled'] === true
}

function getItemBodyClass(item: SparkNode): string {
  return typeof item.props?.['bodyClass'] === 'string' ? item.props['bodyClass'] as string : ''
}

function getItemGridStyle(item: SparkNode): CSSProperties {
  const columns = normalizeSpan(item.props?.['gridColumns'], 24)
  const autoRows = typeof item.props?.['gridAutoRows'] === 'string' && item.props['gridAutoRows'].trim().length > 0
    ? item.props['gridAutoRows'] as string
    : 'minmax(32px, auto)'

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: normalizeGridGap(item.props?.['gridGap']),
    gridAutoRows: autoRows,
    alignItems: 'start',
  }
}

function getItemChildGridStyle(child: SparkNode): CSSProperties {
  const colSpan = normalizeSpan(child.props?.['colSpan'] ?? child.props?.['gridColSpan'] ?? child.props?.['span'], 24)
  const rowSpan = normalizeSpan(child.props?.['rowSpan'] ?? child.props?.['gridRowSpan'], 1)
  return {
    gridColumn: `span ${colSpan} / span ${colSpan}`,
    gridRow: `span ${rowSpan} / span ${rowSpan}`,
    minWidth: 0,
  }
}

function handleModelUpdate(value: CollapseValue): void {
  currentModelValue.value = value
  emit('update:modelValue', value)
}

function handleChange(value: CollapseValue): void {
  currentModelValue.value = value
  props.onChange?.(value)
}

function getToolbarSlotScope() {
  return createToolbarSlotScope({
    dataSource: undefined,
    modelPermission: undefined,
  }, {
    activeNames: currentModelValue.value,
    items: itemConfigs.value,
  })
}

function getItemSlotScope(item: SparkNode, index: number) {
  return {
    item,
    itemIndex: index,
    itemName: getItemName(item, index),
    itemTitle: getItemTitle(item, index),
    activeNames: currentModelValue.value,
  }
}
</script>

<style scoped>
.renderer-collapse-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-collapse-layout--top,
.renderer-collapse-layout--bottom {
  flex-direction: column;
}

.renderer-collapse-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-collapse-layout--right {
  flex-direction: row-reverse;
}

.renderer-collapse-main {
  min-width: 0;
  flex: 1;
}

.renderer-collapse-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-collapse-layout--left .renderer-collapse-toolbar,
.renderer-collapse-layout--right .renderer-collapse-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-collapse-item-body {
  width: 100%;
  min-width: 0;
  padding-top: 8px;
}

.renderer-collapse-grid-item {
  min-width: 0;
}
</style>