<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-switch
        :model-value="fieldValue"
        :active-text="activeText"
        :inactive-text="inactiveText"
        :disabled="isDisabled || !isSwitchEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 开关字段，绑定 boolean 值，支持自定义开/关文本说明。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceNullableBooleanValue } from './composables/fieldValueCoercion'
import { useSwitchNullValue } from './composables/useSwitchNullValue'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RSwitchProps } from './FieldSwitch.props'

const props = withDefaults(defineProps<RSwitchProps>(), {
  type: 'r-switch',
  activeText: '是',
  inactiveText: '否',
})

const { isDisabled } = useSparkPageComponent(props)

const emit = defineEmits<FieldValueUpdateEmits<boolean | null>>()

function formatSwitchValue(value: unknown): string {
  return value ? props.activeText : props.inactiveText
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean | null>({
  props,
  fieldType: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
  coerce: coerceNullableBooleanValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { boundColumn, contextData, dataSource, currentRow, fieldName, fieldValue, isCurrentFieldEditable, syncValue } = permission

const isSwitchEditable = computed(() => {
  // 字段级开关在无行上下文或未绑定字段时默认可编辑；
  // 若已解析到权限快照，则仍遵循字段级 editable 约束。
  if (currentRow.value === null || fieldName.value === '') return true
  return isCurrentFieldEditable.value
})

useSwitchNullValue({
  boundColumn,
  contextData,
  dataSource,
  fieldName,
  syncValue,
})

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>
