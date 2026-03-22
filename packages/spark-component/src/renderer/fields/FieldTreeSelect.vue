<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-tree-select
        :model-value="fieldValue"
        :data="options"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :multiple="multiple"
        :check-strictly="checkStrictly"
        :default-expand-all="defaultExpandAll"
        :render-after-expand="renderAfterExpand"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { useOptionField } from './useFieldOptions'
import type { SparkNode } from '../_pkg'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type FieldPrimitive = string | number | boolean
type TreeSelectValue = FieldPrimitive | FieldPrimitive[]

interface Props {
  /** SPARK 配置驱动 */
  config?: SparkNode
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** bindRules 提取的子组件配置 */
  sparkChildren?: SparkNode[]
  /** 双向绑定值 */
  modelValue?: TreeSelectValue
  /** 树形选项（嵌套结构） */
  options?: unknown[]
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
  /** 默认展开所有节点 */
  defaultExpandAll?: boolean
  /** 展开后才渲染子节点 */
  renderAfterExpand?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  defaultExpandAll: false,
  renderAfterExpand: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: TreeSelectValue]
}>()

const optionResult = useOptionField<TreeSelectValue>({
  props,
  type: 'r-tree-select',
  fallbackValue: '',
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: TreeSelectValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>