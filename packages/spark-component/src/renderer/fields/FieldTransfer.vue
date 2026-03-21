<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-transfer
        :model-value="fieldValue"
        :data="transferData"
        :titles="titles"
        :filterable="filterable"
        :filter-placeholder="filterPlaceholder"
        :target-order="targetOrder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { useOptionField } from './useFieldOptions'
import type { SparkNode } from '../_pkg'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type TransferValue = Array<string | number>

interface Props {
  config?: SparkNode
  field?: string
  label?: string
  width?: number
  sparkChildren?: SparkNode[]
  modelValue?: TransferValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  titles?: [string, string]
  filterable?: boolean
  filterPlaceholder?: string
  targetOrder?: 'original' | 'push' | 'unshift'
}

const props = withDefaults(defineProps<Props>(), {
  titles: () => ['待选', '已选'] as [string, string],
  filterable: false,
  filterPlaceholder: '请输入关键词',
  targetOrder: 'original',
})

const emit = defineEmits<{
  'update:modelValue': [value: TransferValue]
}>()

const optionResult = useOptionField<TransferValue>({
  props,
  type: 'r-transfer',
  fallbackValue: [],
})

const { transferData, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: TransferValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>