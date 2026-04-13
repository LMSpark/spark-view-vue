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
/**
 * @skill r-autocomplete
 * @description 自动补全输入字段，绑定 string 值，基于 el-autocomplete 提供输入建议和搜索匹配。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RAutocompleteProps } from './FieldAutocomplete.props'

type SuggestionItem = Record<string, unknown>

const props = withDefaults(defineProps<RAutocompleteProps>(), {
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
