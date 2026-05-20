<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-input
        :model-value="typeof fieldValue === 'string' ? fieldValue : (fieldValue == null ? '' : String(fieldValue))"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-text
 * @description 文本输入字段，绑定 string 值。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceStringValue } from './composables/fieldValueCoercion'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTextProps } from './FieldText.props'

const props = withDefaults(defineProps<RTextProps>(), {
  type: 'r-text',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-text',
  fallbackValue: '',
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>
