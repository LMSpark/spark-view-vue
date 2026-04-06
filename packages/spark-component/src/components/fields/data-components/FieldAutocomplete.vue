<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-autocomplete
        :model-value="fieldValue as string"
        :placeholder="placeholder"
        :fetch-suggestions="fetchSuggestions"
        :trigger-on-focus="triggerOnFocus"
        :highlight-first-item="highlightFirstItem"
        :clearable="clearable"
        :disabled="!isCurrentFieldEditable"
        :value-key="valueKey"
        @update:model-value="handleChange"
        @select="handleSelect"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../../internal'
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

type SuggestionItem = Record<string, unknown>
type FetchSuggestionsCallback = (suggestions: SuggestionItem[]) => void

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string
  /** 占位文本 */
  placeholder?: string
  /** 获取建议的回调函数 */
  fetchSuggestions?: (queryString: string, cb: FetchSuggestionsCallback) => void
  /** 聚焦时是否触发建议 */
  triggerOnFocus?: boolean
  /** 高亮第一项 */
  highlightFirstItem?: boolean
  /** 可清空 */
  clearable?: boolean
  /** 建议项的取值键 */
  valueKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-autocomplete',
  placeholder: '请输入',
  triggerOnFocus: true,
  highlightFirstItem: false,
  clearable: true,
  valueKey: 'value',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select': [item: SuggestionItem]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-autocomplete',
  fallbackValue: '',
  formatDisplay: value => (value != null ? String(value) : ''),
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}

function handleSelect(item: SuggestionItem): void {
  emit('select', item)
}
</script>
