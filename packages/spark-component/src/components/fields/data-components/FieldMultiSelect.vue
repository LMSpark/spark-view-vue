<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        :collapse-tags="collapseTags"
        :collapse-tags-tooltip="collapseTagsTooltip"
        :max-collapse-tags="maxCollapseTags"
        multiple
        @update:model-value="handleChange"
      >
        <el-option
          v-for="option in options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled || undefined"
        />
      </el-select>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill-description 多选下拉字段，绑定数组值，基于 el-select multiple 模式，支持标签折叠（collapseTags）显示。
 */
import { useChoiceFieldState } from './composables/useChoiceFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

type MultiValue = Array<string | number | boolean>

interface Props extends SparkRuntimeProps<'r-multi-select'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（数组） */
  modelValue?: MultiValue
  /** 选项列表 */
  options?: unknown[]
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 占位提示 */
  placeholder?: string
  /** 可清除 */
  clearable?: boolean
  /** 可搜索 */
  filterable?: boolean
  /** 折叠已选标签 */
  collapseTags?: boolean
  /** 折叠标签提示 */
  collapseTagsTooltip?: boolean
  /** 最大显示标签数 */
  maxCollapseTags?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-multi-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  collapseTags: false,
  collapseTagsTooltip: false,
  maxCollapseTags: 1,
})

const emit = defineEmits<{
  'update:modelValue': [value: MultiValue]
}>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<MultiValue>({
  props,
  fieldType: 'r-multi-select',
  fallbackValue: [],
  emitUpdate: value => emit('update:modelValue', value),
})

async function handleChange(value: MultiValue): Promise<void> {
  await handleControlledChange(value)
}
</script>
