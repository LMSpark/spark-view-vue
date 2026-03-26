<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-cascader
        :model-value="fieldValue"
        :options="options"
        :props="cascaderProps"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SparkNode } from '../_pkg'
import { useOptionField } from './useFieldOptions'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type FieldPrimitive = string | number | boolean
type CascaderPath = FieldPrimitive[]
type CascaderValue = CascaderPath | CascaderPath[]

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: CascaderValue
  /** 树形选项（嵌套结构） */
  options?: unknown[]
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 子节点字段 */
  optionChildrenField?: string
  /** 占位提示 */
  placeholder?: string
  /** 可清除 */
  clearable?: boolean
  /** 可搜索 */
  filterable?: boolean
  /** 多选模式 */
  multiple?: boolean
  /** 父子不关联勾选 */
  checkStrictly?: boolean
  /** 值是否为完整路径数组 */
  emitPath?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-cascader',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  emitPath: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: CascaderValue]
}>()

const optionResult = useOptionField<CascaderValue>({
  props,
  type: 'r-cascader',
  fallbackValue: [],
  formatDisplay: (value, helpers) => helpers.formatCascaderValue(value),
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext({ type: props.type, width: props.width }, optionResult)

const cascaderProps = computed(() => ({
  multiple: props.multiple,
  checkStrictly: props.checkStrictly,
  emitPath: props.emitPath,
}))

function handleChange(value: CascaderValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>