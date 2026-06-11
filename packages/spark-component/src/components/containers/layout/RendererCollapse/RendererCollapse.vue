<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererCollapse/RendererCollapse
RendererCollapse 模块，属于 SPARK component container/layout-container。
组件目录: containers/layout。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div class="renderer-collapse-layout">
    <div v-if="showToolbar" class="renderer-collapse-toolbar">
      <SparkComponentRenderer
        v-for="(tool, index) in visibleToolbarConfigs"
        :key="nodeId(tool) ?? `r-collapse-toolbar-${index}`"
        :config="tool"
      />
    </div>
    <div class="renderer-collapse-main">
      <el-collapse
        :model-value="currentValue"
        @update:model-value="handleModelUpdate"
        @change="handleChange"
      >
        <template v-if="itemConfigs.length">
          <SparkComponentRenderer
            v-for="(item, index) in itemConfigs"
            :key="getItemKey(item, index)"
            :config="createItemRendererConfig(item, index)"
          />
        </template>
        <slot v-else />
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 折叠面板容器。
 * @category container
 * @notes children 内放 r-collapse-item
 */
import { computed } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, nodeInputProp, nodeInputProps, type SparkNode } from '../../../internal'
import { useContainerToolbar } from '../../runtime/container-ui'
import type { RendererCollapseApi } from './types'
import { createRendererCollapseZeroCode } from './zero-code'
import { useUnifiedValueBridge } from '../state'
import type { RCollapseProps } from './RendererCollapse.props'

const props = withDefaults(defineProps<RCollapseProps>(), {
  type: 'r-collapse',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | Array<string | number>]
}>()

const { registerApi } = useSparkPageComponent(props)

// 工具栏优先通过 props.toolbar 输入。
const itemConfigs = computed(() => getSparkNodeChildren(props.children))
const { visibleToolbarConfigs, showToolbar } = useContainerToolbar({ toolbarNode: () => props.toolbar })
const {
  state: currentValue,
  commitValue: commitCollapseValue,
} = useUnifiedValueBridge<string | number | Array<string | number>>({
  value: computed(() => props.modelValue),
  fallbackValue: [],
  normalize: value => value ?? [],
  emitValue: value => emit('update:modelValue', value),
})

// ── r-collapse 包装 API ──────────────────────────────────────────────────

const {
  collapseApi,
  handleModelUpdate,
  handleChange,
}: {
  collapseApi: RendererCollapseApi
  handleModelUpdate: (value: string | number | Array<string | number>) => void
  handleChange: (value: string | number | Array<string | number>) => void
} = createRendererCollapseZeroCode({
  currentValue,
  commitCollapseValue,
  itemConfigs,
  getItemName,
  onChange: props.onChange,
})

registerApi(collapseApi)

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
    ...nodeInputProps(item),
  }
}

function createItemRendererConfig(item: SparkNode, index: number): SparkNode {
  return {
    type: 'r-collapse-item',
    props: {
      ...getItemComponentProps(item),
      index,
    },
  }
}
</script>

<style scoped>
.renderer-collapse-layout {
  width: 100%;
}

.renderer-collapse-main {
  min-width: 0;
}

.renderer-collapse-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
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
