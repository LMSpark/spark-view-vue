<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <div class="entity-picker-field">
        <el-input
          :model-value="currentDisplayValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="primary-action-button" :disabled="!hasSelectorCapability" @click="openSelector">{{ primaryActionText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PageSelectableValue } from '@spark-view/spark-utils'
import type { SparkNode } from '../internal'
import FieldContextRenderer from './FieldContextRenderer.vue'
import { useFieldContext } from './useFieldContext'
import { useOptionField } from './useFieldOptions'
import { useSelectorFieldActions } from './useSelectorFieldActions'

type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: EntityPickerValue
  /** 选项列表 */
  options?: unknown[]
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 占位提示 */
  placeholder?: string
  /** 选择按钮文案 */
  buttonText?: string
  /** 只读模式按钮文案 */
  readonlyButtonText?: string
  /** 可清除 */
  clearable?: boolean
  /** 多选 */
  multiple?: boolean
  /** 可搜索 */
  searchable?: boolean
  /** 多值分隔符 */
  separator?: string
  /** 值模式 */
  valueMode?: 'auto' | 'array' | 'comma-string'
  /** 实体名称 */
  entityName?: string
  /** 子节点列表 */
  children?: SparkNode[]
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-entity-picker',
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

const optionResult = useOptionField<EntityPickerValue>({
  props,
  type: 'r-entity-picker',
  fallbackValue: '',
})

const {
  flatOptions,
  pageService,
  currentRawValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  syncValue,
} = optionResult

const fieldCtx = useFieldContext({
  type: props.type,
  width: props.width,
  ...(props.children !== undefined ? { children: props.children } : {}),
}, optionResult)

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