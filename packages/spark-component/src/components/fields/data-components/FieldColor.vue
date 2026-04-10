<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <span class="color-cell">
        <span class="color-chip" :style="{ backgroundColor: getRowRawStringValue(row) || '#ffffff' }"></span>
        <span>{{ value }}</span>
      </span>
    </template>
    <template #form>
      <el-color-picker
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <span class="color-cell">
        <span class="color-chip" :style="{ backgroundColor: currentRawStringValue || '#ffffff' }"></span>
        <span>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="color-cell">
          <span class="color-chip" :style="{ backgroundColor: currentRawStringValue || '#ffffff' }"></span>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill-description 颜色选择字段，绑定十六进制颜色字符串，基于 el-color-picker，表格/详情模式显示色块预览。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-color'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（颜色字符串，透传 el-color-picker） */
  modelValue?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-color',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-color',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  emitUpdate: value => emit('update:modelValue', value),
})

const {
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
} = permission

async function handleChange(value: string | null): Promise<void> {
  const next = value ?? ''
  await handleControlledChange(next)
}
</script>

<style scoped>
.color-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.color-chip {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #dcdfe6;
  box-sizing: border-box;
}
</style>
