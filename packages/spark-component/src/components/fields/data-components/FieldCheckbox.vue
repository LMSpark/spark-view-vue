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
 * @description 单个复选框字段，绑定 boolean 值，支持自定义选中/未选中显示文本。
 * @notes checkedText / uncheckedText - 自定义选中/未选中显示文本（代替 trueLabel / falseLabel）
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceBooleanValue } from './composables/fieldValueCoercion'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RCheckboxProps } from './FieldCheckbox.props'

const props = withDefaults(defineProps<RCheckboxProps>(), {
  type: 'r-checkbox',
  checkedText: '是',
  uncheckedText: '否',
  checkboxText: '',
})

const emit = defineEmits<FieldValueUpdateEmits<boolean>>()

function formatCheckboxValue(value: unknown): string {
  return value ? props.checkedText : props.uncheckedText
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean>({
  props,
  fieldType: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
  coerce: coerceBooleanValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, displayLabel } = permission

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>

