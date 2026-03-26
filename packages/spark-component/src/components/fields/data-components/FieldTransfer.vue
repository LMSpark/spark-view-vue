<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-transfer
        :model-value="fieldValue"
        :data="transferData"
        :titles="titles"
        :filterable="filterable"
        :filter-placeholder="filterPlaceholder"
        :target-order="targetOrder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../../internal'
import { useOptionField } from '../options/useFieldOptions'
import { useFieldContext } from '../context/useFieldContext'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

type TransferValue = Array<string | number>

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（已选值数组） */
  modelValue?: TransferValue
  /** 数据源（左侧候选列表） */
  options?: unknown[]
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 左右面板标题 */
  titles?: [string, string]
  /** 可搜索 */
  filterable?: boolean
  /** 搜索框占位符 */
  filterPlaceholder?: string
  /** 右侧排序方式 */
  targetOrder?: 'original' | 'push' | 'unshift'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-transfer',
  titles: () => ['待选', '已选'] as [string, string],
  filterable: false,
  filterPlaceholder: '请输入关键词',
  targetOrder: 'original',
})

const emit = defineEmits<{
  'update:modelValue': [value: TransferValue]
}>()

const optionResult = useOptionField<TransferValue>({
  props,
  type: 'r-transfer',
  fallbackValue: [],
})

const { transferData, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext({ type: props.type, width: props.width }, optionResult)

function handleChange(value: TransferValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>