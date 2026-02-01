<script setup lang="ts">
/**
 * EJ2 Column Component - Vue 3 原生实现
 * 对应 e-column 层级，自动支持堆叠列（通过 children 属性）
 */
import { computed, inject, onMounted, provide, ref } from 'vue'
import type { ColumnModel } from '@syncfusion/ej2-grids'

// 用户的统一组件结构
interface ComponentConfig {
  type: string
  children?: ComponentConfig[]
  [key: string]: any
}

interface Props {
  config?: ComponentConfig
  parentType?: string
}

const props = defineProps<Props>()

// 获取有效的配置
const effectiveConfig = computed<ComponentConfig>(() => {
  return props.config || { type: 'e-column' }
})

// 将配置转换为 EJ2 ColumnModel（移除 children 和 type 属性）
const columnProps = computed<ColumnModel>(() => {
  const { children: _children, type: _type, dataSource: _dataSource, ...columnConfig } = effectiveConfig.value
  return columnConfig as ColumnModel
})

// 获取子组件配置
const childrenComponents = computed<ComponentConfig[]>(() => {
  return effectiveConfig.value.children || []
})

// 父列的方法（用于注册子列）
const columnMethods = inject<{
  addChildColumn: (column: ColumnModel) => void
}>('columnMethods', {
  addChildColumn: () => {}
})

// 当前列的完整 ColumnModel（包括子列）
const fullColumnModel = ref<ColumnModel>({
  ...(columnProps.value as any), // 类型转换以兼容 EJ2
  columns: []
})

// 提供给子组件的上下文
provide('parentColumns', fullColumnModel.value.columns as ColumnModel[])
provide('columnMethods', {
  addChildColumn: (childColumn: ColumnModel) => {
    if (fullColumnModel.value.columns) {
      (fullColumnModel.value.columns as ColumnModel[]).push(childColumn)
    }
  }
})

// 根据父组件类型决定渲染行为
const shouldRender = computed(() => {
  return props.parentType === 'ejs-grid'
})

// 如果是嵌套列，注册到父列
onMounted(() => {
  if (props.parentType === 'e-column') {
    columnMethods.addChildColumn(fullColumnModel.value as any)
  }
})</script>

<template>
  <!-- 只有当父组件是 ejs-grid 时才渲染 e-column 标签 -->
  <e-column v-if="shouldRender" v-bind="columnProps">
    <!-- 如果有子列，则递归渲染 -->
    <template v-for="(childConfig, index) in childrenComponents" :key="`child-${index}`">
      <ColumnComponent :config="childConfig" :parent-type="'e-column'" />
    </template>
  </e-column>

  <!-- 如果是嵌套列，只渲染子组件（不渲染自己的 e-column） -->
  <template v-else>
    <template v-for="(childConfig, index) in childrenComponents" :key="`child-${index}`">
      <ColumnComponent :config="childConfig" :parent-type="'e-column'" />
    </template>
  </template>
</template>

<style scoped>
/* Column 样式 */
</style>
