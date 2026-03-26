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
import type { SparkNode } from '../../internal'
import { useFieldPermission } from '../context/useFieldPermission'
import { useFieldContext } from '../context/useFieldContext'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: boolean
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
  'update:modelValue': [value: boolean]
}>()

function formatSwitchValue(value: unknown): string {
  return value ? props.activeText : props.inactiveText
}

const permission = useFieldPermission<boolean>({
  props,
  type: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext({ type: props.type, width: props.width }, permission)

function handleChange(value: boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>
