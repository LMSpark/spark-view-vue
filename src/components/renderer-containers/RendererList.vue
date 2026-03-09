<!--
/**
 * @skill r-list
 * @description 列表容器，通过 DataKey 绑定 DataView.rows，按卡片/列表重复渲染子字段组件
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { columns?: number, gap?: number|string, rowKey?: string, gridColumns?: number, gridGap?: number|string, gridAutoRows?: string } }
 * @example { "type": "r-list", "dataKey": "Users@rows", "children": [{ "type": "r-text", "name": "name" }] }
 */
-->
<template>
  <div class="renderer-list" :style="listStyle" v-bind="$attrs">
    <template v-if="mergedChildren.length && listRows.length">
      <div
        v-for="(row, index) in listRows"
        :key="getItemKey(row, index)"
        class="renderer-list-cell"
        :style="itemGridStyle"
      >
        <RendererListItemScope
          :row="row"
          :children="mergedChildren"
          :data-source="resolvedView"
          :item-class="itemClass"
          :item-style="itemStyle"
          :use-card="useCard"
          :card-shadow="cardShadow"
          :grid-columns="gridColumns"
          :grid-gap="gridGap"
          :grid-auto-rows="gridAutoRows"
        />
      </div>
    </template>
    <div v-else-if="emptyText" class="renderer-list-empty">{{ emptyText }}</div>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { parseDataKey } from '@spark-view/spark-data'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import RendererListItemScope from './RendererListItemScope.vue'

interface Props {
  config?: ComponentConfig
  dataKey?: string
  sparkChildren?: ComponentConfig[]
  dataView?: DataView | undefined
  columns?: number
  gap?: number | string
  minItemWidth?: string
  rowKey?: string
  emptyText?: string
  itemClass?: string
  itemStyle?: CSSProperties
  useCard?: boolean
  cardShadow?: 'always' | 'hover' | 'never'
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
  itemColSpan?: number
  itemRowSpan?: number
}

const props = withDefaults(defineProps<Props>(), {
  columns: 1,
  gap: 0,
  minItemWidth: '',
  rowKey: 'id',
  emptyText: '暂无数据',
  itemClass: '',
  itemStyle: () => ({}),
  useCard: false,
  cardShadow: 'hover',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  itemRowSpan: 1,
})

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const mergedChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])

const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-list' }
)
const pageDataSet = consume(PAGE_DATASET)

const resolvedView = computed<DataView | null>(() => {
  if (effectiveDataKey.value && pageDataSet) {
    const dk = parseDataKey(effectiveDataKey.value)
    if (dk) return (pageDataSet.getView(dk.tableName, dk.viewId) as DataView) ?? null
  }
  return props.dataView ?? null
})

const listRows = computed<IDataRow[]>(() => resolvedView.value?.rows ?? [])

const normalizedGridGap = computed(() => {
  const value = props.gridGap ?? props.gap
  return typeof value === 'number' ? `${value}px` : value
})

const normalizedItemColSpan = computed(() => {
  if (typeof props.itemColSpan === 'number' && Number.isFinite(props.itemColSpan)) {
    return Math.max(1, Math.trunc(props.itemColSpan))
  }

  if (props.columns > 1) {
    return Math.max(1, Math.floor(props.gridColumns / props.columns))
  }

  return props.gridColumns
})

const normalizedItemRowSpan = computed(() => {
  if (typeof props.itemRowSpan === 'number' && Number.isFinite(props.itemRowSpan)) {
    return Math.max(1, Math.trunc(props.itemRowSpan))
  }
  return 1
})

const listStyle = computed<Record<string, string>>(() => {
  return {
    display: 'grid',
    gap: normalizedGridGap.value,
    gridTemplateColumns: `repeat(${Math.max(props.gridColumns, 1)}, minmax(0, 1fr))`,
    gridAutoRows: props.gridAutoRows,
    alignItems: 'start',
  }
})

const itemGridStyle = computed<CSSProperties>(() => ({
  gridColumn: `span ${normalizedItemColSpan.value} / span ${normalizedItemColSpan.value}`,
  gridRow: `span ${normalizedItemRowSpan.value} / span ${normalizedItemRowSpan.value}`,
  minWidth: 0,
}))

function tryAutoLoad(view: DataView | null) {
  if (!view) return
  if (!view.dataTable?.api) return
  if (typeof view.requestData === 'function') {
    void view.requestData().catch((e: unknown) => {
      logger.error('RendererList: requestData() 失败', e)
    })
  }
}

function getItemKey(row: IDataRow, index: number): string | number {
  const keyValue = row[props.rowKey]
  if (typeof keyValue === 'string' || typeof keyValue === 'number') return keyValue
  return `${props.rowKey}-${index}`
}

watch(resolvedView, (view) => {
  if (!view) return
  sparkProvide(DATA_SOURCE, view)
  tryAutoLoad(view)
}, { immediate: true })

onMounted(() => tryAutoLoad(resolvedView.value))
</script>

<style scoped>
.renderer-list {
  width: 100%;
}

.renderer-list-cell {
  min-width: 0;
}

.renderer-list-empty {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
}
</style>