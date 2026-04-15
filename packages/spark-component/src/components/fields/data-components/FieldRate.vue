<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-rate
        :model-value="fieldValue"
        :max="max"
        :allow-half="allowHalf"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-rate
 * @description 评分字段，绑定 number 值，支持半星模式。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RRateProps } from './FieldRate.props'

const props = withDefaults(defineProps<RRateProps>(), {
  type: 'r-rate',
  max: 5,
  allowHalf: false,
})

const emit = defineEmits<FieldValueUpdateEmits<number>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<number>({
  props,
  fieldType: 'r-rate',
  fallbackValue: 0,
  formatDisplay: value => String(value ?? 0),
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: number): Promise<void> {
  await handleControlledChange(value)
}
</script>

