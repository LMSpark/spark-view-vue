<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        :collapse-tags="collapseTags"
        :collapse-tags-tooltip="collapseTagsTooltip"
        :max-collapse-tags="maxCollapseTags"
        multiple
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
 * @skill r-multi-select
 * @description 多选下拉字段，绑定数组值，支持标签折叠（collapseTags）显示。
 */
import { useChoiceFieldState } from './composables/useChoiceFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RMultiSelectProps, MultiValue } from './FieldMultiSelect.props'

const props = withDefaults(defineProps<RMultiSelectProps>(), {
  type: 'r-multi-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  collapseTags: false,
  collapseTagsTooltip: false,
  maxCollapseTags: 1,
})

const emit = defineEmits<FieldValueUpdateEmits<MultiValue>>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<MultiValue>({
  props,
  fieldType: 'r-multi-select',
  fallbackValue: [],
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

async function handleChange(value: MultiValue): Promise<void> {
  await handleControlledChange(value)
}
</script>

