<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="textarea-display">{{ value }}</span>
    </template>
    <template #form>
      <el-input
        :model-value="fieldValue as string"
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
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string
  /** 行数 */
  rows?: number
  /** 自适应高度 */
  autosize?: boolean | { minRows?: number; maxRows?: number }
  /** 最大长度 */
  maxlength?: number
  /** 显示字数统计 */
  showWordLimit?: boolean
  /** 占位提示 */
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  rows: 4,
  autosize: false,
  showWordLimit: false,
  placeholder: '请输入内容',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const permission = useFieldPermission<string>({
  props,
  type: 'r-textarea',
  fallbackValue: '',
})

const { fieldValue, isCurrentFieldEditable, currentDisplayValue, syncValue } = permission
const fieldCtx = useFieldContext({ width: props.width }, permission)

function handleChange(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>

<style scoped>
.textarea-display {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>