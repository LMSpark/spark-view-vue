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
 * @skill r-checkbox-group
 * @description 复选框组字段，绑定数组值，可切换按钮样式。
 */
import { computed } from 'vue'
import { useOptionFieldState } from './composables/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RCheckboxGroupProps } from './FieldCheckboxGroup.props'

type MultiValue = Array<string | number | boolean>

const props = withDefaults(defineProps<RCheckboxGroupProps>(), {
  type: 'r-checkbox-group',
  buttonStyle: false,
})

const emit = defineEmits<FieldValueUpdateEmits<MultiValue>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<MultiValue>({
  props,
  fieldType: 'r-checkbox-group',
  fallbackValue: [],
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options, fieldName, fieldValue, contextData, isCurrentFieldEditable } = optionResult

const displayValue = computed<MultiValue>(() => {
  const explicitValue = props.value
  if (Array.isArray(explicitValue)) {
    return explicitValue as MultiValue
  }

  const boundField = fieldName.value
  const rowValue = boundField ? contextData?.[boundField] : undefined
  const rawValue = rowValue ?? fieldValue.value
  if (Array.isArray(rawValue)) {
    return rawValue as MultiValue
  }
  return []
})

async function handleChange(value: MultiValue): Promise<void> {
  await handleControlledChange(value)
}
</script>

