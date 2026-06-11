<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldRate
FieldRate 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
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
 * @description 评分字段，绑定 number 值，支持半星模式。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceNumberValue } from './composables/fieldValueCoercion'
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
  coerce: coerceNumberValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: number): Promise<void> {
  await handleControlledChange(value)
}
</script>

