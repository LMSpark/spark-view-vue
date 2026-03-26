<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-input
        :model-value="fieldValue as string"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../../internal'
import { useFieldPermission } from '../context/useFieldPermission'
import { useFieldContext } from '../context/useFieldContext'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名，映射到 DataView 行字段 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const permission = useFieldPermission<string>({
  props,
  type: 'r-text',
  fallbackValue: '',
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext({ type: props.type, width: props.width }, permission)

const handleChange = (val: string) => {
  emit('update:modelValue', val)
  syncValue(val)
}
</script>

