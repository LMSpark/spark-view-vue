<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-tree-select
        :model-value="fieldValue"
        :data="options"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :multiple="multiple"
        :check-strictly="checkStrictly"
        :default-expand-all="defaultExpandAll"
        :render-after-expand="renderAfterExpand"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-tree-select
 * @description 树形选择字段，绑定单值或数组，基于 el-tree-select 支持树形层级结构选择、多选和懒加载。
 */
import { useOptionFieldState } from './composables/useOptionFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTreeSelectProps, TreeSelectValue } from './FieldTreeSelect.props'

const props = withDefaults(defineProps<RTreeSelectProps>(), {
  type: 'r-tree-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  defaultExpandAll: false,
  renderAfterExpand: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: TreeSelectValue]
}>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<TreeSelectValue>({
  props,
  fieldType: 'r-tree-select',
  fallbackValue: '',
  emitUpdate: value => emit('update:modelValue', value),
})

const { options, fieldValue, isCurrentFieldEditable } = optionResult

async function handleChange(value: TreeSelectValue): Promise<void> {
  await handleControlledChange(value)
}
</script>
