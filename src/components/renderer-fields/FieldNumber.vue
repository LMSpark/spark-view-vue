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

  <!-- 在 form 中：渲染为 el-form-item + el-input-number -->
  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <div v-if="isRangeFilter" class="field-number-range">
      <el-input-number
        :model-value="rangeStart"
        :min="min"
        :max="max"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleRangeStartChange"
      />
      <span class="field-number-range-separator">至</span>
      <el-input-number
        :model-value="rangeEnd"
        :min="min"
        :max="max"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleRangeEndChange"
      />
    </div>
    <el-input-number
      v-else
      :model-value="fieldValue as number"
      :min="min"
      :max="max"
      :disabled="!isCurrentFieldEditable"
      @update:model-value="handleChange"
    />
  </el-form-item>

  <!-- 在 tree 中：渲染为树节点的数字内容 -->
  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="tree-node-number">{{ currentDisplayValue }}</span>
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
  modelValue?: number | [number | undefined, number | undefined]
  min?: number
  max?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: number | [number | undefined, number | undefined]]
}>()

function formatNumberValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => formatNumberValue(item)).join(' ~ ')
  if (typeof value === 'number') return String(value)
  if (value === null || value === undefined || value === '') return '0'
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
} = useFieldPermission<number | [number | undefined, number | undefined]>({
  props,
  type: 'r-number',
  fallbackValue: 0,
  formatDisplay: formatNumberValue,
})

const rangeStart = Array.isArray(fieldValue.value) ? fieldValue.value[0] : undefined
const rangeEnd = Array.isArray(fieldValue.value) ? fieldValue.value[1] : undefined

const handleChange = (val: number) => {
  emit('update:modelValue', val)
  syncValue(val)
}

const handleRangeStartChange = (val: number | undefined) => {
  const next: [number | undefined, number | undefined] = [val, rangeEnd]
  emit('update:modelValue', next)
  syncValue(next)
}

const handleRangeEndChange = (val: number | undefined) => {
  const next: [number | undefined, number | undefined] = [rangeStart, val]
  emit('update:modelValue', next)
  syncValue(next)
}
</script>

<style scoped>
.field-number-range {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.field-number-range-separator {
  color: #606266;
}

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
