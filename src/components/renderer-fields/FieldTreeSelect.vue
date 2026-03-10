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
import { useOptionField } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type FieldPrimitive = string | number | boolean
type TreeSelectValue = FieldPrimitive | FieldPrimitive[]

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: TreeSelectValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
  multiple?: boolean
  checkStrictly?: boolean
  defaultExpandAll?: boolean
  renderAfterExpand?: boolean
}

const props = withDefaults(defineProps<Props>(), {
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

const optionResult = useOptionField<TreeSelectValue>({
  props,
  type: 'r-tree-select',
  fallbackValue: '',
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: TreeSelectValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>