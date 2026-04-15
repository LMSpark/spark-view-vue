<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-radio-group :model-value="fieldValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-radio-button' : 'el-radio'"
          v-for="option in options"
          :key="String(option.value)"
          :value="option.value"
          :disabled="option.disabled || undefined"
        >
          {{ option.label }}
        </component>
      </el-radio-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-radio
 * @description 单选按钮组字段，绑定 string/number 值，可切换按钮样式渲染。
 */
import { useChoiceFieldState } from './composables/useChoiceFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RRadioProps } from './FieldRadio.props'

const props = withDefaults(defineProps<RRadioProps>(), {
  type: 'r-radio',
  buttonStyle: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number>>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<string | number>({
  props,
  fieldType: 'r-radio',
  fallbackValue: '',
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

async function handleChange(value: string | number): Promise<void> {
  await handleControlledChange(value)
}
</script>

