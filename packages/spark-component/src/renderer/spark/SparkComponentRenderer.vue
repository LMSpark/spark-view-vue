<template>
  <!-- 已注册：动态渲染组件，子组件通过 Vue DI 自动获取父上下文 -->
  <component
    v-if="resolvedComponent"
    :is="resolvedComponent"
    :config="config"
  />

  <!-- 未注册：降级渲染，继续递归子组件树，不中断渲染 -->
  <div
    v-else
    class="spark-component-renderer spark-component-unregistered"
  >
    <div class="unregistered-warning">
      <strong>⚠️ 未注册的组件类型:</strong> {{ config.type }}
    </div>
    <!-- 未注册时仍递归渲染子组件，父上下文由 Vue DI 自动传递 -->
    <SparkComponentRenderer
      v-for="(child, index) in config.children"
      :key="child.id ?? `child-${index}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * SparkComponentRenderer — SPARK 通用组件递归渲染引擎
 *
 * 职责：
 * 1. 从注册表解析 config.type → Vue 组件
 * 2. 递归渲染子组件树
 * 3. 未注册组件降级显示警告（不抛出异常）
 *
 * 设计要点：
 * - 父子上下文传递完全依赖 Vue DI（useSparkComponent 已 vueProvide SPARK_PARENT_CONTEXT_KEY）
 * - 递归渲染器**不显式传递** parentContext prop，避免冗余耦合
 * - 根节点（或测试场景）可通过 parentContext prop 注入初始父上下文
 *
 * @example
 * ```vue
 * <!-- 根渲染器 -->
 * <SparkComponentRenderer :config="pageConfig" />
 *
 * <!-- 测试时指定 rootContext -->
 * <SparkComponentRenderer :config="config" :parent-context="rootContext" />
 * ```
 */
import { computed } from 'vue'
import { useSparkComponent } from '../../composables/useSparkComponent.js'
import type { ComponentConfig, ComponentContext } from '../../core/types.js'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /**
   * 组件配置（type + props + children）
   */
  config: ComponentConfig
  /**
   * 显式父上下文（可选）
   * 仅用于根节点 / 测试场景。递归子渲染器无需传递，由 Vue DI 自动注入。
   */
  parentContext?: ComponentContext
}

const props = defineProps<Props>()

// ── SPARK 上下文 ───────────────────────────────────────────────────────────────

const { getComponent, isComponentRegistered, logger } = useSparkComponent(
  props.config,
  props.parentContext ? { parentContext: props.parentContext } : undefined
)

// ── 组件解析 ──────────────────────────────────────────────────────────────────

const resolvedComponent = computed(() => {
  if (!isComponentRegistered(props.config.type)) {
    logger.warn(`[SparkComponentRenderer] 未注册的组件类型: ${props.config.type}`)
    return null
  }
  return getComponent(props.config.type)
})
</script>
