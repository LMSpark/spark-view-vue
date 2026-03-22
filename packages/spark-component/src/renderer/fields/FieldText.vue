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
import type { SparkNode } from '../_pkg'
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  /** SPARK 配置驱动 */
  config?: SparkNode
  /** 字段绑定名，映射到 DataView 行字段 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** bindRules 提取的子组件配置 */
  sparkChildren?: SparkNode[]
  /** 双向绑定值 */
  modelValue?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const permission = useFieldPermission<string>({
  props,
  type: 'r-text',
  fallbackValue: '',
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

const handleChange = (val: string) => {
  emit('update:modelValue', val)
  syncValue(val)
}
</script>

