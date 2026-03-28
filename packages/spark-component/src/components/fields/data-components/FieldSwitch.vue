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
import { computed, watchEffect } from 'vue'
import type { SparkNode } from '../../internal'
import { useFieldPermission } from '../context/useFieldPermission'
import { useFieldContext } from '../context/useFieldContext'
import { useControlledFieldChange } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
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

const permission = useFieldPermission<boolean | null>({
  props,
  type: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
})

const { boundColumn, contextData, fieldName, fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext({ type: props.type, width: props.width }, permission)
const normalizedEmptyValue = computed<boolean | null>(() => {
  const column = boundColumn.value
  if (!column) return false
  const colType = column.type.toLowerCase()
  if (colType !== 'boolean' && colType !== 'bool') return false
  return column.allowDBNull === true ? null : false
})

watchEffect(() => {
  if (!fieldName.value || contextData === null || typeof contextData !== 'object') return
  const column = boundColumn.value
  if (!column) return
  const colType = column.type.toLowerCase()
  if (colType !== 'boolean' && colType !== 'bool') return
  const raw = contextData[fieldName.value]
  if (raw === '' || raw === undefined) {
    syncValue(normalizedEmptyValue.value)
  }
})

const { handleControlledChange } = useControlledFieldChange<boolean | null>({
  getValue: () => fieldValue.value,
  emitUpdate: value => emit('update:modelValue', value),
  syncValue,
})

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>
