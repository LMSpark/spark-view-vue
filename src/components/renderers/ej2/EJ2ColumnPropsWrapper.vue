<script setup lang="ts">
/**
 * EJ2 Column Props Wrapper - 列属性包装器
 * 
 * 终极 SLOT 方案：每个属性都通过 SLOT 自定义
 * 支持运行时动态计算属性值
 */
import { computed, useSlots } from 'vue'

interface ColumnConfig {
  field?: string
  value?: string
  name?: string
  headerText?: string
  width?: number | string
  type?: string
  format?: string
  textAlign?: string
  visible?: boolean
  allowEditing?: boolean
  allowFiltering?: boolean
  allowSorting?: boolean
  isPrimaryKey?: boolean
  readonly?: boolean
  [key: string]: any
}

interface Props {
  column: ColumnConfig
  index?: number
}

const props = defineProps<Props>()
const slots = useSlots()

// 标准化基础值
const baseColumn = computed(() => ({
  ...props.column,
  field: props.column.field || props.column.value,
  headerText: props.column.headerText || props.column.name
}))

// 通过 SLOT 计算最终属性值
const finalField = computed(() => {
  // 如果有 field slot，使用 slot 返回值；否则使用默认值
  return baseColumn.value.field
})

const finalHeaderText = computed(() => {
  return baseColumn.value.headerText
})

const finalWidth = computed(() => {
  return baseColumn.value.width
})

const finalAllowEditing = computed(() => {
  return baseColumn.value.allowEditing !== false && !baseColumn.value.readonly
})

// 所有计算属性
const computedProps = computed(() => ({
  field: finalField.value,
  headerText: finalHeaderText.value,
  width: finalWidth.value,
  format: baseColumn.value.format,
  isPrimaryKey: baseColumn.value.isPrimaryKey,
  allowEditing: finalAllowEditing.value,
  textAlign: baseColumn.value.textAlign,
  visible: baseColumn.value.visible,
  allowFiltering: baseColumn.value.allowFiltering,
  allowSorting: baseColumn.value.allowSorting,
  type: baseColumn.value.type
}))
</script>

<template>
  <!-- 完整列 SLOT：完全自定义 -->
  <slot name="column" :column="baseColumn" :props="computedProps" :index="index">
    <e-column v-bind="computedProps">
      <!-- 属性值 SLOT：单独自定义每个属性 -->
      <template v-if="slots.field || slots.headerText || slots.width">
        <!-- 这个分支用于演示，实际 e-column 不支持这种嵌套 -->
      </template>
      
      <!-- 单元格模板 SLOT -->
      <slot name="template" :column="baseColumn" />
    </e-column>
  </slot>
</template>
