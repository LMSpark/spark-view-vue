<template>
  <el-form
    :model="formModel"
    :class="['renderer-field-scope', compact && 'renderer-field-scope--compact']"
    :label-position="labelPosition"
    :label-width="labelWidth"
    :inline="inline"
  >
    <div v-if="!inline" class="renderer-field-scope-grid" :style="gridStyle">
      <div
        v-for="(child, index) in gridChildren"
        :key="nodeId(child) ?? `renderer-field-scope-${index}`"
        class="renderer-field-scope-item"
        :style="getChildGridStyle(child, index)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
    </div>
    <template v-else>
      <SparkComponentRenderer
        v-for="(child, index) in gridChildren"
        :key="nodeId(child) ?? `renderer-field-scope-inline-${index}`"
        :config="child"
      />
    </template>
  </el-form>
</template>

<script setup lang="ts">
/**
 * @skill r-field-scope
 * @description 字段宿主容器：包裹 el-form 并向下 provide DATA_ROW，
 * 使内部字段组件（r-text / r-select 等）可消费当前行数据并参与表单校验；
 * 同时通过 useContainerGrid 提供 24 列栅格布局。
 * 本组件自身不渲染任何字段，字段由 children 中的子节点声明。
 * @category internal
 */
import { computed, shallowReactive, watch } from 'vue'
import { DATA_ROW, SparkComponentRenderer, useSparkComponent } from '../../internal'
import { nodeId, type SparkNode } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from '../composables/container-layout'
import { syncReactiveRow } from '../../support/row-mirror-sync'

interface RendererFieldScopeProps {
  type?: 'r-field-scope'
  id?: string
  /** 表单数据模型 */
  model?: IDataRow
  /** 字段组件配置列表 */
  children?: SparkNode[]
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 自适应最小宽度 */
  autoFitMinWidth?: string
  /** 默认跨列数 */
  defaultColSpan?: number
  /** 最后一行不满时自动拉宽 */
  autoFillLastRow?: boolean
  /** 标签位置 */
  labelPosition?: 'top' | 'left' | 'right'
  /** 标签宽度 */
  labelWidth?: string
  /** 内联模式 */
  inline?: boolean
  /** 紧凑模式 */
  compact?: boolean
}

const props = withDefaults(defineProps<RendererFieldScopeProps>(), {
  type: 'r-field-scope',
  model: () => ({}),
  children: () => [],
  gridColumns: 24,
  gridGap: 12,
  gridAutoRows: 'minmax(32px, auto)',
  autoFitMinWidth: '',
  defaultColSpan: 24,
  autoFillLastRow: false,
  labelPosition: 'top',
  labelWidth: '',
  inline: false,
  compact: false,
})
const { sparkProvide } = useSparkComponent({
  type: props.type,
  ...(props.id !== undefined ? { id: props.id } : {}),
})

const rowMirror = shallowReactive<IDataRow>({})
sparkProvide(DATA_ROW, rowMirror)

function isDataRow(value: unknown): value is IDataRow {
  return value !== null && typeof value === 'object'
}

const formModel = computed<IDataRow>(() =>
  isDataRow(props.model) ? props.model : rowMirror,
)

let syncingFromSource = false
let syncingFromMirror = false

watch(
  () => props.model,
  (incoming) => {
    if (syncingFromMirror) return
    syncingFromSource = true
    try {
      syncReactiveRow(rowMirror, incoming)
    } finally {
      syncingFromSource = false
    }
  },
  { immediate: true, deep: true },
)

watch(
  rowMirror,
  (incoming) => {
    if (syncingFromSource) return
    if (!isDataRow(props.model)) return
    syncingFromMirror = true
    try {
      syncReactiveRow(props.model, incoming)
    } finally {
      syncingFromMirror = false
    }
  },
  { deep: true },
)

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: () => props.children,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
  autoFitMinWidth: () => props.autoFitMinWidth,
  defaultColSpan: () => props.defaultColSpan,
  autoFillLastRow: props.autoFillLastRow,
})
</script>

<style scoped>
.renderer-field-scope-item {
  min-width: 0;
}
.renderer-field-scope--compact .renderer-field-scope-item :deep(.el-form-item),
.renderer-field-scope--compact .renderer-field-scope-item :deep(.el-select),
.renderer-field-scope--compact .renderer-field-scope-item :deep(.el-input),
.renderer-field-scope--compact .renderer-field-scope-item :deep(.el-input-number),
.renderer-field-scope--compact .renderer-field-scope-item :deep(.el-date-editor) {
  width: 100%;
}
.renderer-field-scope--compact :deep(.el-form-item) {
  margin-bottom: 0;
}
.renderer-field-scope--compact :deep(.el-form-item__label) {
  padding-bottom: 0;
  font-size: 12px;
  line-height: 28px;
}
</style>

