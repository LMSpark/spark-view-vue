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
 * 
 * @component SparkComponentRenderer
 * @description
 * SPARK 组件系统的核心渲染引擎，负责根据 JSON 配置递归动态渲染组件树。
 * 支持完全解耦的组件注册机制，可以渲染任意已注册的 SPARK 组件。
 * 
 * 核心功能：
 * 1. **动态组件解析**：从注册表中解析组件类型
 * 2. **递归渲染**：自动递归渲染子组件树
 * 3. **上下文传递**：维护父子组件间的上下文链
 * 4. **错误降级**：未注册组件显示警告，不中断渲染
 * 5. **能力传播**：支持 SPARK 能力系统的上下文传递
 * 
 * @example
 * ```vue
 * <SparkComponentRenderer
 *   :config="{
 *     type: 'user-grid',
 *     id: 'grid-1',
 *     children: [
 *       { type: 'user-row', id: 'row-1' },
 *       { type: 'user-row', id: 'row-2' }
 *     ]
 *   }"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { computed } from 'vue'
import { useSparkComponent, type ComponentContext } from '@spark-view/spark-component'

// ==================== Props ====================

/**
 * 组件属性定义
 */
interface Props {
  /**
   * 组件配置对象
   * 必须包含 type 字段指定组件类型，可选 id、children 等字段
   * @example
   * { type: 'spark-ej2-grid', id: 'grid-1', dataSource: [...] }
   */
  config: ComponentContext
  
  /**
   * 父组件上下文（可选）
   * 用于维护组件树的上下文链，支持能力系统的向上查找
   * @default undefined
   */
  parentContext?: ComponentContext
}

const props = defineProps<Props>()

// ==================== SPARK 上下文 ====================

const {
  context,
  getComponent
} = useSparkComponent(props.config, props.parentContext ? { parentContext: props.parentContext } : {})

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