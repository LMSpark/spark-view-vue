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
import { computed, toRef } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { FieldContext } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from './useContainerGrid'
import { useDataScope } from './useDataScope'

interface Props {
  /** 表单数据模型 */
  model: IDataRow
  /** 字段组件配置列表 */
  configs: SparkNode[]
  /** 字段语境（table/form/detail） */
  context?: FieldContext
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
  context: 'form',
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

const configsRef = toRef(props, 'configs')

useDataScope({
  type: 'r-field-scope',
  fieldContext: computed(() => props.context),
  data: computed(() => props.model),
})

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: configsRef,
  columns: toRef(props, 'gridColumns'),
  gap: toRef(props, 'gridGap'),
  autoRows: toRef(props, 'gridAutoRows'),
  autoFitMinWidth: toRef(props, 'autoFitMinWidth'),
  defaultColSpan: toRef(props, 'defaultColSpan'),
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