<template>
  <div v-if="visible" class="spark-data-view-meta" data-testid="data-view-meta">
    <span class="spark-data-view-meta__item">行数 {{ rowCount }}</span>
    <span v-if="total > 0" class="spark-data-view-meta__item">总数 {{ total }}</span>
    <span v-if="total > 0" class="spark-data-view-meta__item">第 {{ page }} 页 / {{ pageSize }} 条</span>
    <span v-if="selectedCount > 0" class="spark-data-view-meta__item">已选 {{ selectedCount }}</span>
    <span class="spark-data-view-meta__item">状态 {{ requestStateText }}</span>
    <span v-if="mutating" class="spark-data-view-meta__item">变更中</span>
    <span
      v-for="entry in aggregateEntries"
      :key="`aggregate-${entry.key}`"
      class="spark-data-view-meta__item spark-data-view-meta__item--aggregate"
    >{{ entry.label }} {{ entry.value }}</span>
    <span
      v-for="entry in selectionAggregateEntries"
      :key="`selection-aggregate-${entry.key}`"
      class="spark-data-view-meta__item spark-data-view-meta__item--selection"
    >选区{{ entry.label }} {{ entry.value }}</span>
    <span v-if="errorMessage" class="spark-data-view-meta__item spark-data-view-meta__item--error">{{ errorMessage }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DataColumn, IDataRow, RequestState } from '@spark-view/spark-data'

interface AggregateEntry {
  key: string
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  rows?: readonly IDataRow[]
  columns?: readonly DataColumn[]
  selectedRows?: readonly IDataRow[]
  total?: number
  page?: number
  pageSize?: number
  requestState?: RequestState | undefined
  mutating?: boolean
  loadingError?: Error | null
  mutatingError?: Error | null
  aggregateResult?: Readonly<Record<string, unknown>>
  selectionAggregateResult?: Readonly<Record<string, unknown>>
  showDataViewMeta?: boolean
  showAggregateSummary?: boolean
  showSelectionSummary?: boolean
}>(), {
  rows: () => [],
  columns: () => [],
  selectedRows: () => [],
  total: 0,
  page: 1,
  pageSize: 20,
  mutating: false,
  loadingError: null,
  mutatingError: null,
  aggregateResult: () => ({}),
  selectionAggregateResult: () => ({}),
  showDataViewMeta: true,
  showAggregateSummary: true,
  showSelectionSummary: true,
})

const rowCount = computed(() => props.rows.length)
const selectedCount = computed(() => props.selectedRows.length)
const REQUEST_STATE_LABELS: Record<string, string> = {
  '0': 'Idle',
  '1': 'Preparing',
  '2': 'Loading',
  '3': 'Loaded',
  '4': 'Failed',
}
const requestStateText = computed(() => REQUEST_STATE_LABELS[String(props.requestState)] ?? String(props.requestState ?? 'Idle'))
const errorMessage = computed(() => {
  const error = props.loadingError ?? props.mutatingError
  return error?.message ?? ''
})

const columnLabelMap = computed(() => {
  const map = new Map<string, string>()
  for (const column of props.columns) {
    map.set(column.name, column.label ?? column.name)
  }
  return map
})

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  return String(value)
}

function toEntries(value: Readonly<Record<string, unknown>> | undefined): AggregateEntry[] {
  if (!value) return []
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    label: columnLabelMap.value.get(key) ?? key,
    value: formatValue(entryValue),
  }))
}

const aggregateEntries = computed(() =>
  props.showAggregateSummary === true ? toEntries(props.aggregateResult) : [],
)

const selectionAggregateEntries = computed(() =>
  props.showSelectionSummary === true ? toEntries(props.selectionAggregateResult) : [],
)

const visible = computed(() => props.showDataViewMeta === true)
</script>

<style scoped>
.spark-data-view-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  background: var(--el-fill-color-extra-light, #fafafa);
  color: var(--el-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.4;
}

.spark-data-view-meta__item {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
}

.spark-data-view-meta__item--aggregate {
  color: var(--el-color-primary, #409eff);
}

.spark-data-view-meta__item--selection {
  color: var(--el-color-success, #67c23a);
}

.spark-data-view-meta__item--error {
  color: var(--el-color-danger, #f56c6c);
}
</style>
