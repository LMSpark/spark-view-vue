<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-checkbox
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        {{ checkboxText || displayLabel }}
      </el-checkbox>
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
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** bindRules 提取的子组件配置 */
  sparkChildren?: SparkNode[]
  /** 双向绑定值 */
  modelValue?: boolean
  /** 选中时显示文案 */
  checkedText?: string
  /** 未选时显示文案 */
  uncheckedText?: string
  /** 复选框右侧文案 */
  checkboxText?: string
}

const props = withDefaults(defineProps<Props>(), {
  checkedText: '是',
  uncheckedText: '否',
  checkboxText: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function formatCheckboxValue(value: unknown): string {
  return value ? props.checkedText : props.uncheckedText
}

const permission = useFieldPermission<boolean>({
  props,
  type: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
})

const { fieldValue, isCurrentFieldEditable, displayLabel, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

function handleChange(value: boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>
