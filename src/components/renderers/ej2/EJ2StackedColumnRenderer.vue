<script setup lang="ts">
/**
 * EJ2 Stacked Column Renderer - 堆叠列渲染器
 * 
 * 专门处理不绑定字段的标签列（堆叠表头）
 * 支持嵌套子列（可以是标签列或普通列）
 */
import { computed } from 'vue'

interface ColumnConfig {
  headerText?: string
  textAlign?: string
  width?: number | string
  visible?: boolean
  customAttributes?: Record<string, any>
  field?: string
  template?: string
  format?: string
  type?: string
  columns?: ColumnConfig[]
  children?: ColumnConfig[]
  [key: string]: any
}

interface Props {
  config: ColumnConfig
  index?: number
}

const props = defineProps<Props>()

// 标准化配置：统一 children 和 columns
const normalizedConfig = computed(() => {
  const config = { ...props.config }
  const subColumns = config.children || config.columns || []
  
  return {
    headerText: config.headerText || '未命名列组',
    textAlign: config.textAlign || 'Center',
    width: config.width,
    visible: config.visible !== false,
    customAttributes: config.customAttributes || {},
    children: subColumns
  }
})

// 是否有子列
const hasChildren = computed(() => 
  normalizedConfig.value.children && normalizedConfig.value.children.length > 0
)

// 检查子列是否为堆叠列
const isStackedColumn = (col: ColumnConfig) => {
  return !col.field && (col.children?.length || col.columns?.length)
}

// 调试日志
if (import.meta.env.DEV) {
  console.log('🔧 EJ2StackedColumnRenderer:', {
    headerText: normalizedConfig.value.headerText,
    childrenCount: normalizedConfig.value.children.length,
    children: normalizedConfig.value.children
  })
}
</script>

<template>
  <!-- 堆叠列 SLOT：自定义整个列组 -->
  <slot :config="normalizedConfig" :index="index" :has-children="hasChildren">
    <e-column
      :header-text="normalizedConfig.headerText"
      :text-align="normalizedConfig.textAlign"
      :width="normalizedConfig.width"
      :visible="normalizedConfig.visible"
      :custom-attributes="normalizedConfig.customAttributes"
    >
      <!-- 子列 SLOT：递归渲染子列 -->
      <slot name="children" :columns="normalizedConfig.children">
        <template v-if="hasChildren">
          <template v-for="(childColumn, childIndex) in normalizedConfig.children" :key="childIndex">
            <!-- 递归处理：子列也是堆叠列 -->
            <EJ2StackedColumnRenderer
              v-if="isStackedColumn(childColumn)"
              :config="childColumn"
              :index="childIndex"
            />
            
            <!-- 普通列：直接使用 e-column 指令 -->
            <e-column
              v-else
              :field="childColumn.field"
              :header-text="childColumn.headerText"
              :text-align="childColumn.textAlign || 'Left'"
              :width="childColumn.width"
              :type="childColumn.type"
              :format="childColumn.format"
              :template="childColumn.template"
              :visible="childColumn.visible !== false"
              :allow-editing="childColumn.allowEditing"
              :allow-filtering="childColumn.allowFiltering"
              :allow-sorting="childColumn.allowSorting"
              :is-primary-key="childColumn.isPrimaryKey"
            />
          </template>
        </template>
      </slot>
    </e-column>
  </slot>
</template>

<style scoped>
/* 堆叠列样式（如需要） */
</style>
