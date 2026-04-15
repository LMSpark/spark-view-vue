<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <span class="icon-cell">
        <i v-if="getRowRawStringValue(row)" :class="iconClass(getRowRawStringValue(row))"></i>
        <span>{{ value }}</span>
      </span>
    </template>
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        <el-option
          v-for="option in options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled || undefined"
        >
          <div class="icon-option">
            <i v-if="option.value" :class="iconClass(String(option.value))"></i>
            <span>{{ option.label }}</span>
          </div>
        </el-option>
      </el-select>
    </template>
    <template #tree>
      <span class="icon-cell">
        <i v-if="currentRawStringValue" :class="iconClass(currentRawStringValue)"></i>
        <span>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="icon-cell">
          <i v-if="currentRawStringValue" :class="iconClass(currentRawStringValue)"></i>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-icon
 * @description 图标选择字段，绑定图标名称字符串。
 */
import { useOptionFieldState } from './composables/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RIconProps } from './FieldIcon.props'

const props = withDefaults(defineProps<RIconProps>(), {
  type: 'r-icon',
  placeholder: '请选择图标',
  clearable: true,
  filterable: true,
  classPrefix: '',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<string>({
  props,
  fieldType: 'r-icon',
  fallbackValue: '',
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const {
  options,
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
} = optionResult

function iconClass(value: string): string {
  return props.classPrefix ? `${props.classPrefix}${value}` : value
}

async function handleChange(value: string | number | boolean): Promise<void> {
  const next = String(value ?? '')
  await handleControlledChange(next)
}
</script>

<style scoped>
.icon-cell,
.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>

