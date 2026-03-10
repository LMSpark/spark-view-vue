<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <div class="entity-picker-field">
      <el-input
        :model-value="currentDisplayValue"
        readonly
        :placeholder="placeholder"
      />
      <el-button class="primary-action-button" :disabled="!hasSelectorCapability" @click="openSelector">{{ primaryActionText }}</el-button>
      <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
    </div>
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
import { computed } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { PageSelectableValue } from '@spark-view/spark-utils'
import { useOptionField } from './useFieldOptions'
import { useSelectorFieldActions } from './useSelectorFieldActions'

type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: EntityPickerValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  placeholder?: string
  buttonText?: string
  readonlyButtonText?: string
  clearable?: boolean
  multiple?: boolean
  searchable?: boolean
  separator?: string
  valueMode?: 'auto' | 'array' | 'comma-string'
  entityName?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  buttonText: '选择',
  readonlyButtonText: '查看',
  clearable: true,
  multiple: false,
  searchable: true,
  separator: ', ',
  valueMode: 'auto',
  entityName: '项目',
})

const emit = defineEmits<{
  'update:modelValue': [value: EntityPickerValue]
}>()

const {
  flatOptions,
  fieldName,
  displayLabel,
  context,
  pageService,
  currentRawValue,
  currentRawStringValue,
  isCurrentFieldHidden,
  isCurrentFieldEditable,
  currentDisplayValue,
  isTableCellHidden,
  getTableCellDisplayValue,
  syncValue,
} = useOptionField<EntityPickerValue>({
  props,
  type: 'r-entity-picker',
  fallbackValue: '',
})

const { hasSelectorCapability, primaryAction, selectEntities } = useSelectorFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

const primaryActionText = computed(() => (primaryAction.value === 'select' ? props.buttonText : props.readonlyButtonText))
const hasValue = computed(() => Array.isArray(currentRawValue.value)
  ? currentRawValue.value.length > 0
  : currentRawStringValue.value.trim().length > 0)
const showClearButton = computed(() => props.clearable && isCurrentFieldEditable.value && hasValue.value)

function updateValue(value: EntityPickerValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}

function buildNextValue(values: PageSelectableValue[]): EntityPickerValue {
  if (props.multiple) {
    if (props.valueMode === 'array') return values
    if (props.valueMode === 'auto' && Array.isArray(currentRawValue.value)) return values
    return values.map(value => String(value)).join(props.separator)
  }
  return values[0] ?? ''
}

function openSelector(): void {
  void selectEntities({
    title: `${primaryActionText.value}${props.entityName}`,
    entityName: props.entityName,
    placeholder: props.placeholder,
    multiple: props.multiple,
    searchable: props.searchable,
    currentValue: currentRawValue.value,
    options: flatOptions.value.map(option => ({
      label: option.label,
      value: option.value,
      ...(option.disabled === true ? { disabled: true } : {}),
    })),
  }).then((selected) => {
    if (!isCurrentFieldEditable.value) return
    const nextValues = selected.map(item => item.value)
    updateValue(buildNextValue(nextValues))
  })
}

function clearValue(): void {
  updateValue(props.multiple && (props.valueMode === 'array' || (props.valueMode === 'auto' && Array.isArray(currentRawValue.value))) ? [] : '')
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

.entity-picker-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.entity-picker-field :deep(.el-input) {
  flex: 1;
}
</style>