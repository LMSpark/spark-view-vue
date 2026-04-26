<template>
  <!--
    行片段仅负责作用域转发：
    - 上游若传 rowScope，则交由 RendererHostScope 解析 DATA_ROW；
    - 上游若传 data，则直接作为 DATA_ROW。
    
    支持栅格布局（类似 FieldScope）：
    - 若指定 gridColumns/gridGap，则以栅格方式排列 children；
    - 否则以内联方式逐个渲染。
  -->
  <div v-if="!inline" class="renderer-row-fragment-grid" :style="gridStyle">
    <div
      v-for="(child, index) in gridChildren"
      :key="nodeId(child) ?? `renderer-row-fragment-${index}`"
      class="renderer-row-fragment-item"
      :style="getChildGridStyle(child, index)"
    >
      <RendererHostScope
        type="r-data-scope"
        :row="resolvedDataInput"
        :row-scope="rowScope"
        :children="[child]"
      />
    </div>
  </div>
  <template v-else>
    <RendererHostScope
      type="r-data-scope"
      :row="resolvedDataInput"
      :row-scope="rowScope"
      :children="resolvedChildren"
    />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../../internal'
import RendererHostScope from '../../support/RendererHostScope.vue'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { RendererRowFragmentProps as Props } from './RendererRowFragment.types.js'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-row-fragment',
  gridColumns: 24,
  gridGap: 12,
  gridAutoRows: 'minmax(32px, auto)',
  autoFitMinWidth: '',
  defaultColSpan: 24,
  autoFillLastRow: false,
  labelPosition: 'top',
  labelWidth: '',
  inline: true,
  compact: false,
})

// ===== 子节点解析 =====

// 直接使用 children 字段
const resolvedChildren = computed<SparkNode[]>(() => {
  return getSparkNodeChildren(props.children)
})

// 栅格布局支持
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: () => resolvedChildren.value,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
  autoFitMinWidth: () => props.autoFitMinWidth,
  defaultColSpan: () => props.defaultColSpan,
  autoFillLastRow: props.autoFillLastRow,
})

// ===== 行数据输入 =====

// 冻结空对象作为"无数据"语义，避免子字段因 undefined 而崩溃，同时防止意外写入。
const EMPTY_DATA_ROW = Object.freeze({}) as IDataRow

const rowScope = computed<Record<string, unknown> | undefined>(() => props.rowScope)

// data 有值时直传；仅 rowScope 场景交由 HostScope 内部解析；两者都缺省时回退空行。
const resolvedDataInput = computed<IDataRow | undefined>(() => {
  if (props.data !== undefined) return props.data
  if (rowScope.value !== undefined) return undefined
  return EMPTY_DATA_ROW
})
</script>

<style scoped>
.renderer-row-fragment-item {
  min-width: 0;
}
</style>