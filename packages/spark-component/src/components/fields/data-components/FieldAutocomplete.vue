<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldAutocomplete
FieldAutocomplete 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
导出 ClassModel symbol: SuggestionItem（共 1 个 symbol）。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-autocomplete
        :model-value="fieldValue"
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
/**
 * @description 自动补全输入字段，绑定 string 值。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceStringValue } from './composables/fieldValueCoercion'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RAutocompleteProps } from './FieldAutocomplete.props'

/** 自动补全候选项的通用数据结构。 */
type SuggestionItem = {
  [key: string]: unknown}

const props = withDefaults(defineProps<RAutocompleteProps>(), {
  type: 'r-autocomplete',
  placeholder: '请输入',
  triggerOnFocus: true,
  highlightFirstItem: false,
  clearable: true,
  valueKey: 'value',
})

const emit = defineEmits<FieldValueUpdateEmits<string> & {
  /**
   * Suggestion selected; 用户从自动完成候选项中选择一项。
   * @param item Selected suggestion option.
   */
  'select': [item: SuggestionItem]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-autocomplete',
  fallbackValue: '',
  formatDisplay: value => (value != null ? String(value) : ''),
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}

function handleSelect(item: SuggestionItem): void {
  emit('select', item)
}
</script>

