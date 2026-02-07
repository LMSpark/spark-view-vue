<template>
  <!-- 动态渲染组件 -->
  <component
    :is="resolvedComponent"
    v-if="resolvedComponent"
    :config="config"
    :parent-context="parentContext"
  >
    <!-- 递归使用渲染器渲染子组件 -->
    <SparkComponentRenderer
      v-for="(child, index) in config.children"
      :key="`child-${index}`"
      :config="child"
      :parent-context="context"
    />
  </component>

  <!-- 未注册组件的默认渲染 -->
  <div
    v-else
    class="spark-component-renderer spark-component-unregistered"
  >
    <div class="unregistered-warning">
      <strong>⚠️ 未注册的组件类型:</strong> {{ config.type }}
    </div>

    <!-- 递归使用渲染器渲染子组件 -->
    <SparkComponentRenderer
      v-for="(child, index) in config.children"
      :key="`child-${index}`"
      :config="child"
      :parent-context="context"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * SPARK 通用组件渲染器 - 基于配置动态渲染组件
 * 完全解耦：只依赖公共逻辑，不依赖其他自定义组件
 */
import { computed } from 'vue'
import { useSparkComponent, type ComponentContext } from '@spark-view/spark-component'

// ==================== Props ====================

interface Props {
  config: ComponentContext
  parentContext?: ComponentContext
}

const props = defineProps<Props>()

// ==================== SPARK 上下文 ====================

const {
  context,
  getComponent
} = useSparkComponent(props.config, props.parentContext as any)

// ==================== 组件解析 ====================

/**
 * 从注册表解析组件
 */
const resolvedComponent = computed(() => {
  const component = getComponent(props.config.type)
  if (!component) {
    console.warn(`⚠️ SPARK Component not registered: ${props.config.type}`)
  }
  return component
})

</script>

<style scoped>
.spark-component-renderer {
  /* 通用渲染器样式 */
}
</style>