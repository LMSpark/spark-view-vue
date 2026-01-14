<script setup lang="ts">
/**
 * EJ2 Columns Wrapper - 支持 SLOT 的列包装器
 * 
 * 解决 EJ2 Grid 指令系统与 Vue slot 不兼容的问题
 * 通过多层包装组件实现完全的 SLOT 自定义能力
 * 
 * 支持四层 SLOT 自定义：
 * 1. 列表级别：#default slot 自定义所有列
 * 2. 列级别：#column slot 自定义单个列
 * 3. 属性级别：通过子组件 slot 自定义具体属性
 * 4. 内容级别：#template slot 自定义单元格内容
 */
import { computed } from 'vue'
import EJ2ColumnWrapper from './EJ2ColumnWrapper.vue'

interface ColumnConfig {
  field?: string
  value?: string  // form-create uses 'value' instead of 'field'
  name?: string   // form-create uses 'name' instead of 'headerText'
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
  columns?: ColumnConfig[]
}

const props = withDefaults(defineProps<Props>(), {
  columns: () => []
})

// 标准化列配置（兼容 form-create 和 EJ2 格式）
const normalizedColumns = computed(() => {
  return props.columns.map(col => ({
    ...col,
    field: col.field || col.value,
    headerText: col.headerText || col.name
  }))
})
</script>

<template>
  <e-columns>
    <!-- 层级 1：列表级 SLOT - 自定义所有列的渲染逻辑 -->
    <slot :columns="normalizedColumns">
      <!-- 层级 2：列级 SLOT - 使用包装组件提供更细粒度控制 -->
      <template v-for="(col, index) in normalizedColumns" :key="col.field || index">
        <slot name="column" :column="col" :index="index">
          <!-- 层级 3：属性级 SLOT - 使用 ColumnWrapper 包装单列 -->
          <EJ2ColumnWrapper :column="col" :index="index">
            <!-- 层级 4：内容级 SLOT - 自定义单元格渲染 -->
            <template #template="{ column }">
              <slot :name="`cell-${column.field}`" :column="column" />
            </template>
          </EJ2ColumnWrapper>
        </slot>
      </template>
    </slot>
  </e-columns>
</template>
