<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-radio-group :model-value="fieldValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-radio-button' : 'el-radio'"
          v-for="option in options"
          :key="String(option.value)"
          :value="option.value"
          :disabled="option.disabled || undefined"
        >
          {{ option.label }}
        </component>
      </el-radio-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill-description 单选按钮组字段，绑定 string/number 值，基于 el-radio-group，可切换按钮样式渲染。
 */
import { useChoiceFieldState } from './composables/useChoiceFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-radio'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string | number
  /** 选项列表 */
  options?: unknown[]
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 按钮风格 */
  buttonStyle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-radio',
  buttonStyle: false,
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
  fieldType: 'r-radio',
  fallbackValue: '',
  emitUpdate: value => emit('update:modelValue', value),
})

async function handleChange(value: string | number): Promise<void> {
  await handleControlledChange(value)
}
</script>
