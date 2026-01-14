<script setup lang="ts">
/**
 * EJ2 Column Wrapper - 单列包装器
 * 
 * 为 <e-column> 的每个属性提供 SLOT 自定义能力
 * 实现真正的"全 SLOT"架构
 */
import { computed } from 'vue'

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
  template?: string
  isPrimaryKey?: boolean
  readonly?: boolean
  [key: string]: any
}

interface Props {
  column: ColumnConfig
  index?: number
}

const props = defineProps<Props>()

// 标准化列配置
const normalizedColumn = computed(() => ({
  ...props.column,
  field: props.column.field || props.column.value,
  headerText: props.column.headerText || props.column.name,
  allowEditing: props.column.allowEditing !== false && !props.column.readonly
}))
</script>

<template>
  <!-- 单列 SLOT：自定义整个列 -->
  <slot :column="normalizedColumn" :index="index">
    <!-- 属性级 SLOT：自定义每个属性 -->
    <e-column
      :field="normalizedColumn.field"
      :header-text="normalizedColumn.headerText"
      :width="normalizedColumn.width"
      :format="normalizedColumn.format"
      :is-primary-key="normalizedColumn.isPrimaryKey"
      :allow-editing="normalizedColumn.allowEditing"
      :text-align="normalizedColumn.textAlign"
      :visible="normalizedColumn.visible"
      :allow-filtering="normalizedColumn.allowFiltering"
      :allow-sorting="normalizedColumn.allowSorting"
      :type="normalizedColumn.type"
    >
      <!-- 单元格内容 SLOT -->
      <slot name="template" :column="normalizedColumn">
        <!-- 使用 EJ2 template 语法 -->
        <slot :name="`cell-${normalizedColumn.field}`" />
      </slot>
    </e-column>
  </slot>
</template>
