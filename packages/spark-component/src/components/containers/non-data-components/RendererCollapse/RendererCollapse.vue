<!--
/**
 * @skill r-collapse
 * @description 折叠面板容器，内部使用 r-collapse-item 定义分组；支持 `r-toolbar` wrapper 工具栏，每个折叠项内容默认采用 24 列 CSS Grid
 * @input { props: { modelValue?: string|number|Array<string|number> }, children?: [{ type: 'r-toolbar'|'r-collapse-item', props?: Record<string, unknown>, children?: SparkNode[] }] }
 * @example { "type": "r-collapse", "children": [{ "type": "r-collapse-item", "props": { "title": "基本信息", "name": "base" }, "children": [] }] }
 */
-->
<template>
  <div :class="['renderer-collapse-layout', `renderer-collapse-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-collapse-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-collapse-toolbar-${index}`"
        :config="action"
      />
    </div>

    <div class="renderer-collapse-main">
      <el-collapse
        v-bind="$attrs"
        :model-value="currentModelValue"
        @update:model-value="handleModelUpdate"
        @change="handleChange"
      >
        <template v-if="itemConfigs.length">
          <RendererCollapseItem
            v-for="(item, index) in itemConfigs"
            :key="getItemKey(item, index)"
            :index="index"
            :type="item.type"
            v-bind="getItemComponentProps(item)"
          >
            <slot v-if="!hasItemChildren(item)" v-bind="getItemSlotScope(item, index)" />
          </RendererCollapseItem>
        </template>
        <slot v-else />
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 折叠面板容器，基于 el-collapse 管理子面板（r-collapse-item）的展开与折叠状态。
 */
import { computed } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, nodeInputProp, type SparkNode } from '../../../internal'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererCollapseItem from '../RendererCollapseItem.vue'
import type { RendererCollapseApi } from './types'
import { createRendererCollapseZeroCode } from './zero-code'
import { useControlledValue } from '../state'

type CollapseValue = string | number | Array<string | number>

interface Props extends SparkNode {
  /** 子节点（折叠项配置） */
  children?: SparkNode[]
  /** 结构化工具栏 dock */
  toolbar?: SparkNode
  /** 当前展开的面板 */
  modelValue?: CollapseValue
  /** 展开/折叠切换回调 */
  onChange?: (value: CollapseValue) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-collapse',
})

const emit = defineEmits<{
  'update:modelValue': [value: CollapseValue]
}>()

const { registerApi } = useSparkPageComponent(props)

// Dock 节点已由绑定层从 children 提升为 props（toolbar）
const contentChildren = computed(() => props.children ?? [])

const itemConfigs = computed(() =>
  getSparkNodeChildren(contentChildren.value).filter(child => child.type === 'r-collapse-item')
)
const dockedToolbar = computed(() => getSparkNodeChildren(props.toolbar?.children))

const currentModelValue = useControlledValue(computed(() => props.modelValue))

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => dockedToolbar.value),
    toolbarPosition: computed(() => props.toolbar?.props?.['position'] as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.toolbar?.props?.['class'] as string | undefined),
  modelPermission: computed(() => undefined),
})

// ── r-collapse 包装 API ──────────────────────────────────────────────────

const {
  collapseApi,
  handleModelUpdate,
  handleChange,
}: {
  collapseApi: RendererCollapseApi
  handleModelUpdate: (value: CollapseValue) => void
  handleChange: (value: CollapseValue) => void
} = createRendererCollapseZeroCode({
  emit,
  currentModelValue,
  itemConfigs,
  getItemName,
  onChange: props.onChange,
})

registerApi(collapseApi)

defineExpose(collapseApi)

function hasItemChildren(item: SparkNode): boolean {
  return getSparkNodeChildren(item.children).length > 0
}

function getItemName(item: SparkNode, index: number): string | number {
  const value = nodeInputProp(item, 'name') ?? nodeId(item)
  return typeof value === 'string' || typeof value === 'number' ? value : `collapse-${index}`
}

function getItemKey(item: SparkNode, index: number): string | number {
  return nodeId(item) ?? getItemName(item, index)
}

function getItemComponentProps(item: SparkNode): Record<string, unknown> {
  const resolvedId = nodeId(item)
  return {
    ...(resolvedId !== undefined ? { id: resolvedId } : {}),
    ...(item.children !== undefined ? { children: item.children } : {}),
    ...(item.props ?? {}),
  }
}

function getItemSlotScope(item: SparkNode, index: number) {
  return {
    item,
    itemIndex: index,
    itemName: getItemName(item, index),
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

.renderer-collapse-item-grid-item {
  min-width: 0;
}
</style>
