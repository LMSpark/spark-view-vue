<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldCheckboxGroup
FieldCheckboxGroup 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-checkbox-group :model-value="displayValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-checkbox-button' : 'el-checkbox'"
          v-for="option in options"
          :key="String(option.value)"
          :label="option.value"
          :disabled="option.disabled || undefined"
        >
          {{ option.label }}
        </component>
      </el-checkbox-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 复选框组字段，绑定数组值，可切换按钮样式。
 */
import { computed } from 'vue'
import { useOptionFieldState } from './composables/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coercePrimitiveOptionArray } from './composables/fieldValueCoercion'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { CheckboxGroupMultiValue, RCheckboxGroupProps } from './FieldCheckboxGroup.props'

const props = withDefaults(defineProps<RCheckboxGroupProps>(), {
  type: 'r-checkbox-group',
  buttonStyle: false,
})

const emit = defineEmits<FieldValueUpdateEmits<CheckboxGroupMultiValue>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<CheckboxGroupMultiValue>({
  props,
  fieldType: 'r-checkbox-group',
  fallbackValue: [],
  coerce: coercePrimitiveOptionArray,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options, fieldName, currentRow, fieldValue, isCurrentFieldEditable } = optionResult

const displayValue = computed<CheckboxGroupMultiValue>(() => {
  const boundField = fieldName.value
  const rowValue = boundField ? currentRow.value?.[boundField] : undefined

  if (rowValue !== undefined) {
    return coercePrimitiveOptionArray(rowValue)
  }

  if (!boundField) {
    return coercePrimitiveOptionArray(props.modelValue)
  }

  return coercePrimitiveOptionArray(fieldValue.value)
})

async function handleChange(value: CheckboxGroupMultiValue): Promise<void> {
  await handleControlledChange(value)
}
</script>
