<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-cascader
        :model-value="fieldValue"
        :options="options"
        :props="cascaderProps"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useOptionField } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type FieldPrimitive = string | number | boolean
type CascaderPath = FieldPrimitive[]
type CascaderValue = CascaderPath | CascaderPath[]

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: CascaderValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
  multiple?: boolean
  checkStrictly?: boolean
  emitPath?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  emitPath: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: CascaderValue]
}>()

const optionResult = useOptionField<CascaderValue>({
  props,
  type: 'r-cascader',
  fallbackValue: [],
  formatDisplay: (value, helpers) => helpers.formatCascaderValue(value),
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext(props, optionResult)

const cascaderProps = computed(() => ({
  multiple: props.multiple,
  checkStrictly: props.checkStrictly,
  emitPath: props.emitPath,
}))

function handleChange(value: CascaderValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>