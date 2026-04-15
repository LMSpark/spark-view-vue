<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-time-select
        :model-value="fieldValue as string"
        :placeholder="placeholder"
        :start="start"
        :end="end"
        :step="step"
        :min-time="minTime"
        :max-time="maxTime"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-time-select
 * @description 时间间隔选择字段，绑定时间字符串值。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTimeSelectProps } from './FieldTimeSelect.props'

const props = withDefaults(defineProps<RTimeSelectProps>(), {
  type: 'r-time-select',
  placeholder: '选择时间',
  start: '08:30',
  end: '18:30',
  step: '00:15',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-time-select',
  fallbackValue: '',
  formatDisplay: value => (value != null ? String(value) : ''),
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>

