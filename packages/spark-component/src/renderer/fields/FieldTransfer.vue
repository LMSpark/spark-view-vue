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
import { useOptionField } from './useFieldOptions'
import type { SparkNode } from '../_pkg'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type TransferValue = Array<string | number>

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
  /** 双向绑定值（已选值数组） */
  modelValue?: TransferValue
  /** 数据源（左侧候选列表） */
  options?: unknown[]
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
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: TransferValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>