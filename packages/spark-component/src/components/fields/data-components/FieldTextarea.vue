<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="textarea-display">{{ value }}</span>
    </template>
    <template #form>
      <el-input
        :model-value="typeof fieldValue === 'string' ? fieldValue : (fieldValue == null ? '' : String(fieldValue))"
        type="textarea"
        :rows="rows"
        :autosize="autosize"
        :maxlength="maxlength"
        :show-word-limit="showWordLimit"
        :placeholder="placeholder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <span class="textarea-display">{{ currentDisplayValue }}</span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value textarea-display">{{ currentDisplayValue }}</span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-textarea
 * @description 多行文本字段，绑定 string 值，支持自动高度和字数限制。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTextareaProps } from './FieldTextarea.props'

const props = withDefaults(defineProps<RTextareaProps>(), {
  type: 'r-textarea',
  rows: 4,
  autosize: false,
  showWordLimit: false,
  placeholder: '请输入内容',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-textarea',
  fallbackValue: '',
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, currentDisplayValue } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>

<style scoped>
.textarea-display {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

