<!--
/**
 * @skill (internal) field-scope
 * @description 字段作用域容器，提供 el-form 包裹和 CONTEXT_DATA 能力；字段语义由祖先 context.type 推断
 */
-->
<template>
  <el-form
    :model="model"
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
        :style="getChildGridStyle(child)"
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
import { computed } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import { nodeId, type SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from './useContainerGrid'
import { useDataScope } from './useDataScope'

interface Props extends SparkNode {
  /** 表单数据模型 */
  model: IDataRow
  /** 字段组件配置列表 */
  configs: SparkNode[]
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
  /** 标签位置 */
  labelPosition?: 'top' | 'left' | 'right'
  /** 标签宽度 */
  labelWidth?: string
  /** 内联模式 */
  inline?: boolean
  /** 紧凑模式 */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-field-scope',
  gridColumns: 24,
  gridGap: 12,
  gridAutoRows: 'minmax(32px, auto)',
  autoFitMinWidth: '',
  defaultColSpan: 24,
  labelPosition: 'top',
  labelWidth: '',
  inline: false,
  compact: false,
})
const componentType = computed(() => props.type ?? 'r-field-scope')

useDataScope({
  type: componentType.value,
  nodeConfig: {
    type: componentType.value,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.dock !== undefined ? { dock: props.dock } : {}),
    ...(props.order !== undefined ? { order: props.order } : {}),
    ...(props.children !== undefined ? { children: props.children } : {}),
  },
  data: computed(() => props.model),
})

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: () => props.configs,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
  autoFitMinWidth: () => props.autoFitMinWidth,
  defaultColSpan: () => props.defaultColSpan,
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