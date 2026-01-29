<script setup lang="ts">
/**
 * 统一递归组件渲染器 - 简化版本
 * 暂时简化以支持重构
 */
import { computed } from 'vue'
import type { SparkComponentConfig as ComponentConfig } from '@spark-view/spark-core'
import GridComponent from './GridComponent.vue'
import ColumnComponent from './ColumnComponent.vue'

// 主组件 Props
interface Props {
  config: ComponentConfig
}

const props = defineProps<Props>()

// 简化的渲染逻辑
const componentType = computed(() => {
  // 使用本地组件而不是直接映射到ejs-*
  if (props.config.type === 'GridComponent') {
    return GridComponent
  }
  if (props.config.type === 'ColumnComponent') {
    return ColumnComponent
  }
  return null
})

const componentProps = computed(() => {
  // 对于GridComponent和ColumnComponent，传递整个config对象
  // 因为这些组件期望config属性
  return { config: props.config }
})

const childResults = computed(() => {
  return props.config.children || []
})

// 调试信息
console.log('🎯 渲染组件:', {
  type: props.config.type,
  config: props.config,
  hasRenderer: !!componentType.value,
  childrenCount: props.config.children?.length || 0
})
</script>

<template>
  <!-- 动态组件渲染 -->
  <component
    :is="componentType"
    v-if="componentType"
    v-bind="componentProps"
  />

  <!-- 逻辑组件 (如 ColumnComponent) - 只渲染子组件 -->
  <template v-else-if="childResults.length > 0">
    <RendererComponent
      v-for="(childConfig, index) in childResults"
      :key="`logic-child-${index}`"
      :config="childConfig"
    />
  </template>

  <!-- 逻辑组件无子组件时不渲染 (ColumnComponent) -->
  <template v-else-if="config.type === 'ColumnComponent'">
    <!-- ColumnComponent 已注册到父组件，不需要渲染 -->
  </template>

  <!-- 未知组件类型 -->
  <div v-else class="error-component">
    ❌ 未知组件类型: {{ config.type }}
  </div>
</template>

<style scoped>
.error-component {
  color: red;
  padding: 10px;
  border: 1px solid red;
  background: #ffe6e6;
}
</style>