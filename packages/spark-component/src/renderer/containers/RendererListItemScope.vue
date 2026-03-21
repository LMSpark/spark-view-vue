<template>
  <div :class="itemClass" :style="itemStyle">
    <el-card v-if="useCard" :shadow="cardShadow" class="renderer-list-card">
      <div class="renderer-list-item-body" :style="itemBodyStyle">
        <template v-if="gridChildren.length">
          <div
            v-for="(child, i) in gridChildren"
            :key="child.id ?? `r-list-item-child-${i}`"
            class="renderer-list-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </template>
        <slot v-else />
      </div>
    </el-card>

    <div v-else class="renderer-list-item-body" :style="itemBodyStyle">
      <template v-if="gridChildren.length">
        <div
          v-for="(child, i) in gridChildren"
          :key="child.id ?? `r-list-item-child-${i}`"
          class="renderer-list-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { IDataRow, IDataSource } from '@spark-view/spark-data'
import { DATA_SOURCE } from '../_pkg'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../_pkg'
import { useContainerGrid } from './useContainerGrid'

interface Props {
  row: IDataRow
  children: SparkNode[]
  dataSource?: IDataSource | null
  itemClass?: string
  itemStyle?: CSSProperties
  useCard?: boolean
  cardShadow?: 'always' | 'hover' | 'never'
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  dataSource: null,
  itemClass: '',
  itemStyle: () => ({}),
  useCard: false,
  cardShadow: 'hover',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const rowRef = toRef(props, 'row')
const childrenRef = toRef(props, 'children')

const { provide: sparkProvide } = useSparkComponent({ type: 'r-list-item' })
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: childrenRef,
  columns: toRef(props, 'gridColumns'),
  gap: toRef(props, 'gridGap'),
  autoRows: toRef(props, 'gridAutoRows'),
})

const itemBodyStyle = computed(() =>
  gridChildren.value.length > 0 ? gridStyle.value : undefined
)

sparkProvide(FIELD_CONTEXT, 'list')

watch(rowRef, (row) => {
  sparkProvide(CONTEXT_DATA, row as Record<string, unknown>)
}, { immediate: true })

watch(() => props.dataSource, (dataSource) => {
  if (dataSource) {
    sparkProvide(DATA_SOURCE, dataSource)
  }
}, { immediate: true })
</script>

<style scoped>
.renderer-list-card {
  height: 100%;
}

.renderer-list-item-body {
  width: 100%;
}

.renderer-list-grid-item {
  min-width: 0;
}
</style>