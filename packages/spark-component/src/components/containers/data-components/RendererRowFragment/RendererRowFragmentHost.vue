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
      <RendererDataScope
        type="r-data-scope"
        :data="resolveSlotRow(scope)"
        :children="resolvedChildren"
      />
    </template>
  </el-table-column>

  <RendererDataScope
    v-else
    type="r-data-scope"
    :data="resolvedData"
    :children="resolvedChildren"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { useSparkHost, type SparkNode } from '../../../internal'
import RendererDataScope from './RendererDataScope.vue'
import type { RendererRowFragmentProps as Props } from './RendererRowFragment.types.js'

const props = defineProps<Props>()

const { hostType } = useSparkHost<'r-table'>({ hostTypes: ['r-table'] as const })
const isTableHost = computed(() => hostType.value === 'r-table')
const resolvedChildren = computed<SparkNode[]>(() => props.children ?? [])
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