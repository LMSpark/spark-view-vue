<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-input
        :model-value="fieldValue as string"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-text
 * @description 文本输入字段，绑定 string 值，基于 el-input 提供单行文本编辑能力。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTextProps } from './FieldText.props'

const props = withDefaults(defineProps<RTextProps>(), {
  type: 'r-text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-text',
  fallbackValue: '',
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>
