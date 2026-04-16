<template>
  <el-table-column
    v-if="isTableHost"
    :label="resolvedColumnLabel"
    :width="width"
    :min-width="minWidth"
    :align="align"
    :header-align="resolvedHeaderAlign"
    :class-name="props.class"
  >
    <template #default="scope">
      <RendererHostRowScope
        type="r-data-scope"
        :row="resolveSlotRow(scope)"
        :children="resolvedChildren"
      />
    </template>
  </el-table-column>

  <RendererHostRowScope
    v-else
    type="r-data-scope"
    :row="resolvedData"
    :children="resolvedChildren"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { getSparkNodeChildren, useSparkConsume, type SparkNode } from '../../../internal'
import RendererHostRowScope from '../../support/RendererHostRowScope.vue'
import type { RendererRowFragmentProps as Props } from './RendererRowFragment.types.js'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-row-fragment',
})

const { host } = useSparkConsume()
const isTableHost = computed(() => host.nearestHost()?.fieldMode === 'table')

const resolvedChildren = computed<SparkNode[]>(() => {
  const fieldNodes = getSparkNodeChildren(props.fields)
  if (fieldNodes.length > 0) return fieldNodes
  return getSparkNodeChildren(props.children)
})
const resolvedColumnLabel = computed(() => props.title ?? props.label ?? '')
const resolvedHeaderAlign = computed(() => props.headerAlign ?? props.align)
const EMPTY_DATA_ROW = Object.freeze({}) as IDataRow
const resolvedData = computed(() => props.data ?? EMPTY_DATA_ROW)

function resolveSlotRow(scope: Record<string, unknown>): IDataRow {
  const row = scope['row']
  return row !== null && row !== undefined && typeof row === 'object' && !Array.isArray(row)
    ? row as IDataRow
    : EMPTY_DATA_ROW
}
</script>