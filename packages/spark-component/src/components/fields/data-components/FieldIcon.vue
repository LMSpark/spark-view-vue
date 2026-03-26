<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <span class="icon-cell">
        <i v-if="getRowRawStringValue(row)" :class="iconClass(getRowRawStringValue(row))"></i>
        <span>{{ value }}</span>
      </span>
    </template>
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        <el-option
          v-for="option in options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled"
        >
          <div class="icon-option">
            <i v-if="option.value" :class="iconClass(String(option.value))"></i>
            <span>{{ option.label }}</span>
          </div>
        </el-option>
      </el-select>
    </template>
    <template #tree>
      <span class="icon-cell">
        <i v-if="currentRawStringValue" :class="iconClass(currentRawStringValue)"></i>
        <span>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="icon-cell">
          <i v-if="currentRawStringValue" :class="iconClass(currentRawStringValue)"></i>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../../internal'
import { useOptionField } from '../options/useFieldOptions'
import { useFieldContext } from '../context/useFieldContext'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（图标名） */
  modelValue?: string
  /** 图标选项列表 */
  options?: unknown[]
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 占位提示 */
  placeholder?: string
  /** 可清除 */
  clearable?: boolean
  /** 可搜索 */
  filterable?: boolean
  /** 图标 CSS 类名前缀 */
  classPrefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-icon',
  placeholder: '请选择图标',
  clearable: true,
  filterable: true,
  classPrefix: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const optionResult = useOptionField<string>({
  props,
  type: 'r-icon',
  fallbackValue: '',
})

const {
  options,
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
  syncValue,
} = optionResult

const fieldCtx = useFieldContext({ type: props.type, width: props.width }, optionResult)

function iconClass(value: string): string {
  return props.classPrefix ? `${props.classPrefix}${value}` : value
}

function handleChange(value: string | number | boolean): void {
  const next = String(value ?? '')
  emit('update:modelValue', next)
  syncValue(next)
}
</script>

<style scoped>
.icon-cell,
.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>