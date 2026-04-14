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
 * @skill r-switch
 * @description 开关字段，绑定 boolean 值，基于 el-switch 提供状态切换，支持自定义开/关文本说明。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { useSwitchNullValue } from './composables/useSwitchNullValue'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RSwitchProps } from './FieldSwitch.props'

const props = withDefaults(defineProps<RSwitchProps>(), {
  type: 'r-switch',
  activeText: '是',
  inactiveText: '否',
})

const emit = defineEmits<FieldValueUpdateEmits<boolean | null>>()

function formatSwitchValue(value: unknown): string {
  return value ? props.activeText : props.inactiveText
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean | null>({
  props,
  fieldType: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
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
