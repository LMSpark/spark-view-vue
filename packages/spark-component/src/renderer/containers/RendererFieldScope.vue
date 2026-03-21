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
        :key="child.id ?? `renderer-field-scope-${index}`"
        class="renderer-field-scope-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
    </div>
    <template v-else>
      <SparkComponentRenderer
        v-for="(child, index) in gridChildren"
        :key="child.id ?? `renderer-field-scope-inline-${index}`"
        :config="child"
      />
    </template>
  </el-form>
</template>

<script setup lang="ts">
import { toRef, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { DATA_SOURCE, CONTEXT_DATA, FIELD_CONTEXT } from '../_pkg'
import type { FieldContext } from '../_pkg'
import { useContainerGrid } from './useContainerGrid'

interface Props {
  model: Record<string, unknown>
  configs: SparkNode[]
  context?: FieldContext
  dataSource?: IDataSource | DataView | null
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
  autoFitMinWidth?: string
  defaultColSpan?: number
  labelPosition?: 'top' | 'left' | 'right'
  labelWidth?: string
  inline?: boolean
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  context: 'form',
  dataSource: null,
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

const { provide: sparkProvide } = useSparkComponent({ type: 'r-field-scope' })
const configsRef = toRef(props, 'configs')

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: configsRef,
  columns: toRef(props, 'gridColumns'),
  gap: toRef(props, 'gridGap'),
  autoRows: toRef(props, 'gridAutoRows'),
  autoFitMinWidth: toRef(props, 'autoFitMinWidth'),
  defaultColSpan: toRef(props, 'defaultColSpan'),
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