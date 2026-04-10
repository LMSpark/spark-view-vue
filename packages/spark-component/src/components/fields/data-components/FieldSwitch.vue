<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-switch
        :model-value="fieldValue"
        :active-text="activeText"
        :inactive-text="inactiveText"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill-description 开关字段，绑定 boolean 值，基于 el-switch 提供状态切换，支持自定义开/关文本说明。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { useSwitchNullValue } from './composables/useSwitchNullValue'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-switch'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: boolean | null
  /** 激活时文案 */
  activeText?: string
  /** 未激活时文案 */
  inactiveText?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-switch',
  activeText: '是',
  inactiveText: '否',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean | null]
}>()

function formatSwitchValue(value: unknown): string {
  return value ? props.activeText : props.inactiveText
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean | null>({
  props,
  fieldType: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
  emitUpdate: value => emit('update:modelValue', value),
})

const { boundColumn, contextData, fieldName, fieldValue, isCurrentFieldEditable, syncValue } = permission
useSwitchNullValue({
  boundColumn,
  contextData,
  fieldName,
  syncValue,
})

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>
