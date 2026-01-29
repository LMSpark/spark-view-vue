<script setup lang="ts">
/**
 * EJ2 Grid Component - Vue 3 原生实现
 * 对应 ejs-grid 层级，处理顶级网格配置
 */
import { computed, provide } from 'vue'
import { GridComponent as EjsGrid } from '@syncfusion/ej2-vue-grids'
import { Grid, Page } from '@syncfusion/ej2-grids'
import type { GridModel } from '@syncfusion/ej2-vue-grids'
import ColumnComponent from './ColumnComponent.vue'

// 注入 EJ2 Grid 模块
provide('ej2-grids', [Grid, Page])

// 用户的统一组件结构
interface ComponentConfig {
  type: string
  children?: ComponentConfig[]
  [key: string]: any
}

// 扩展EJ2的GridModel以支持children
interface ExtendedGridModel extends GridModel {
  children?: ComponentConfig[]
}

interface Props {
  config: ExtendedGridModel
}

const props = defineProps<Props>()

// 提取网格配置（移除children属性，保留EJ2原生属性）
const gridProps = computed(() => {
  const { children: _children, ...config } = props.config
  return config
})

// 提取子组件（应该是一个 e-columns）
const childrenComponents = computed(() => {
  return props.config.children || []
})

// 调试信息
const isDev = (import.meta as any).env?.MODE === 'development'
if (isDev) {
  console.log('🎯 GridComponent 渲染:', {
    config: props.config,
    gridProps: gridProps.value,
    childrenCount: childrenComponents.value.length
  })
}
</script>

<template>
  <!-- 使用 e-columns 标签包裹列定义，这是 EJ2 Grid 的官方结构 -->
  <ejs-grid ref="ejsGridRef" v-bind="gridProps">
    <e-columns>
      <!-- 渲染子组件，每个 ColumnComponent 会渲染为 e-column -->
      <template v-for="(child, index) in childrenComponents" :key="index">
        <ColumnComponent
          :config="child"
          :parent-type="'ejs-grid'"
        />
      </template>
      <!-- 插槽支持：允许使用 <ColumnComponent> 作为组件子节点 -->
      <slot />
    </e-columns>
  </ejs-grid>
</template>

<style scoped>
/* Grid 样式 */
</style>