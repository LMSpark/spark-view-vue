<template>
  <el-form :model="model" class="renderer-field-scope" label-position="top">
    <div class="renderer-field-scope-grid" :style="gridStyle">
      <div
        v-for="(child, index) in gridChildren"
        :key="child.id ?? `renderer-field-scope-${index}`"
        class="renderer-field-scope-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
    </div>
  </el-form>
</template>

<script setup lang="ts">
import { toRef, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { DATA_SOURCE } from '@spark-view/spark-component'
import { CONTEXT_DATA, FIELD_CONTEXT } from '../capability-keys'
import type { FieldContext } from '../capability-keys'
import { useContainerGrid } from './useContainerGrid'

interface Props {
  model: Record<string, unknown>
  configs: ComponentConfig[]
  context?: FieldContext
  dataSource?: IDataSource | DataView | null
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  context: 'form',
  dataSource: null,
  gridColumns: 24,
  gridGap: 12,
  gridAutoRows: 'minmax(32px, auto)',
})

const { provide: sparkProvide } = useSparkComponent({ type: 'r-field-scope' })
const configsRef = toRef(props, 'configs')

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: configsRef,
  columns: toRef(props, 'gridColumns'),
  gap: toRef(props, 'gridGap'),
  autoRows: toRef(props, 'gridAutoRows'),
})

sparkProvide(FIELD_CONTEXT, props.context)
sparkProvide(CONTEXT_DATA, props.model)

watch(() => props.dataSource, (dataSource) => {
  if (dataSource) {
    sparkProvide(DATA_SOURCE, dataSource as IDataSource)
  }
}, { immediate: true })
</script>

<style scoped>
.renderer-field-scope-item {
  min-width: 0;
}
</style>