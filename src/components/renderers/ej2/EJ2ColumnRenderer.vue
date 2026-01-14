<script setup lang="ts">
/**
 * EJ2 Column Renderer - EJ2 列渲染器
 * 
 * 根据 parentType 决定渲染方式：
 * - ej2-table/ej2-grid: 渲染成 EJ2 Grid 列
 * - ej2-stacked-column: 作为堆叠列的子列
 * - 其他: 不渲染（EJ2 列只能在 Grid 中）
 */
import { computed } from 'vue'

defineOptions({
  name: 'EJ2ColumnRenderer'
})

interface ColumnConfig {
  type: string
  field?: string
  headerText?: string
  textAlign?: string
  width?: number | string
  visible?: boolean
  format?: string
  template?: string
  allowEditing?: boolean
  allowFiltering?: boolean
  allowSorting?: boolean
  isPrimaryKey?: boolean
  children?: ColumnConfig[]
  [key: string]: any
}

interface Props {
  config: ColumnConfig
  parentType?: string
  data?: any
}

const props = withDefaults(defineProps<Props>(), {
  parentType: '',
  data: () => ({})
})

// 标准化列配置
const normalizedConfig = computed(() => ({
  field: props.config.field,
  headerText: props.config.headerText,
  textAlign: props.config.textAlign || 'Left',
  width: props.config.width,
  visible: props.config.visible !== false,
  format: props.config.format,
  template: props.config.template,
  allowEditing: props.config.allowEditing,
  allowFiltering: props.config.allowFiltering,
  allowSorting: props.config.allowSorting,
  isPrimaryKey: props.config.isPrimaryKey,
  children: props.config.children || []
}))

// 是否为堆叠列（没有 field 但有 children）
const isStackedColumn = computed(() => {
  return !normalizedConfig.value.field && normalizedConfig.value.children.length > 0
})

// 是否有子列
const hasChildren = computed(() => normalizedConfig.value.children.length > 0)

if (import.meta.env.DEV) {
  console.log('🔧 EJ2ColumnRenderer:', {
    type: props.config.type,
    parentType: props.parentType,
    field: normalizedConfig.value.field,
    headerText: normalizedConfig.value.headerText,
    isStackedColumn: isStackedColumn.value,
    childrenCount: normalizedConfig.value.children.length
  })
}
</script>

<template>
  <!-- 只在 EJ2 Grid 上下文中渲染 -->
  <template v-if="parentType === 'ej2-table' || parentType === 'ej2-grid' || parentType === 'ej2-stacked-column'">
    <!-- 🎯 堆叠列：不绑定字段，只作为分组标签 -->
    <e-column
      v-if="isStackedColumn"
      :header-text="normalizedConfig.headerText"
      :text-align="normalizedConfig.textAlign"
      :width="normalizedConfig.width"
      :visible="normalizedConfig.visible"
    >
      <!-- 递归渲染子列 -->
      <template v-if="hasChildren">
        <EJ2ColumnRenderer
          v-for="(child, index) in normalizedConfig.children"
          :key="index"
          :config="child"
          :parent-type="'ej2-stacked-column'"
          :data="data"
        />
      </template>
    </e-column>
    
    <!-- 普通列：绑定字段 -->
    <e-column
      v-else
      :field="normalizedConfig.field"
      :header-text="normalizedConfig.headerText"
      :text-align="normalizedConfig.textAlign"
      :width="normalizedConfig.width"
      :visible="normalizedConfig.visible"
      :format="normalizedConfig.format"
      :template="normalizedConfig.template"
      :allow-editing="normalizedConfig.allowEditing"
      :allow-filtering="normalizedConfig.allowFiltering"
      :allow-sorting="normalizedConfig.allowSorting"
      :is-primary-key="normalizedConfig.isPrimaryKey"
    />
  </template>
</template>
