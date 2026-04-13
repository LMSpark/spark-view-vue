<template>
  <FieldContextRenderer v-bind="fieldCtx">
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
          :disabled="option.disabled || undefined"
        />
      </el-select>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-select
 * @description 单选下拉字段，绑定 string/number 值，基于 el-select，支持静态选项列表或 optionKey 动态数据源绑定。
 */
import { useChoiceFieldState } from './composables/useChoiceFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RSelectProps } from './FieldSelect.props'

const props = withDefaults(defineProps<RSelectProps>(), {
  type: 'r-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<string | number>({
  props,
  fieldType: 'r-select',
  fallbackValue: '',
  emitUpdate: value => emit('update:modelValue', value),
})

async function handleChange(value: string | number): Promise<void> {
  await handleControlledChange(value)
}
</script>
