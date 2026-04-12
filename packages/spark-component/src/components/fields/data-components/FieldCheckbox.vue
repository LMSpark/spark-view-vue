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
/**
 * @skill r-checkbox
 * @description 单个复选框字段，绑定 boolean 值，基于 el-checkbox，支持自定义选中/未选中显示文本。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-checkbox'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
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
  type: 'r-checkbox',
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

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean>({
  props,
  fieldType: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable, displayLabel } = permission

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>
