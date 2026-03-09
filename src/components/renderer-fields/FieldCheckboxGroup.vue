<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-checkbox-group :model-value="fieldValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
      <component
        :is="buttonStyle ? 'el-checkbox-button' : 'el-checkbox'"
        v-for="option in options"
        :key="String(option.value)"
        :label="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </component>
    </el-checkbox-group>
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="tree-node-text">{{ currentDisplayValue }}</span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value">{{ currentDisplayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { useFieldPermission } from './useFieldPermission'
import { useFieldOptions } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'

type MultiValue = Array<string | number | boolean>

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: MultiValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  buttonStyle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  buttonStyle: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: MultiValue]
}>()

const { options, formatOptionValue } = useFieldOptions(props)
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
} = useFieldPermission<MultiValue>({
  props,
  type: 'r-checkbox-group',
  fallbackValue: [],
  formatDisplay: formatOptionValue,
})

function handleChange(value: MultiValue): void {
  emit('update:modelValue', value)
  syncValue(value)
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