<template>
  <!-- 在 table 中：渲染为 el-table-column -->
  <template v-if="context === 'table'">
    <el-table-column
      :label="displayLabel"
      :prop="fieldName"
      :width="width"
    >
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <!-- 在 form 中：渲染为 el-form-item + el-date-picker -->
  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-date-picker
      :model-value="fieldValue as string | Date | Array<string | Date>"
      :type="isRangeFilter ? 'daterange' : 'date'"
      :placeholder="isRangeFilter ? undefined : '选择日期'"
      :start-placeholder="isRangeFilter ? '开始日期' : undefined"
      :end-placeholder="isRangeFilter ? '结束日期' : undefined"
      :range-separator="isRangeFilter ? '至' : undefined"
      :disabled="!isCurrentFieldEditable"
      @update:model-value="handleChange"
    />
  </el-form-item>

  <!-- 在 tree 中：渲染为树节点的日期内容 -->
  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="tree-node-date">{{ currentDisplayValue }}</span>
  </template>

  <!-- 在 detail 或其他上下文中：只读展示 -->
  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value">{{ currentDisplayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'

interface Props {
  config?: ComponentConfig
  /** 字段名（form-create 路径透传；SparkComponentRenderer 路径从 config.name 读取） */
  name?: string
  /** 显示标签（可选，默认回退到 name） */
  label?: string
  width?: number
  modelValue?: string | Date | Array<string | Date>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string | Date | Array<string | Date>]
}>()

function formatDateValue(value: unknown): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.map(item => formatDateValue(item)).join(' ~ ')
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

const isRangeFilter =
  props.config?.props?.['filterMode'] === 'range'
  || props.config?.props?.['filterVariant'] === 'range'
  || props.config?.props?.['filterRange'] === true

const {
  fieldName,
  displayLabel,
  context,
  fieldValue,
  isCurrentFieldHidden,
  isCurrentFieldEditable,
  currentDisplayValue,
  isTableCellHidden,
  getTableCellDisplayValue,
  syncValue,
} = useFieldPermission<string | Date | Array<string | Date>>({
  props,
  type: 'r-date',
  fallbackValue: '',
  formatDisplay: formatDateValue,
})

const handleChange = (val: string | Date | Array<string | Date>) => {
  emit('update:modelValue', val)
  syncValue(val)
}
</script>

<style scoped>
.field-display {
  margin-bottom: 12px;
  line-height: 32px;
}
.field-label {
  color: #606266;
  font-weight: 500;
  margin-right: 8px;
}
.field-value {
  color: #303133;
}
</style>
