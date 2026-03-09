<template>
  <!-- 已注册：动态渲染组件，子组件通过 Vue DI 自动获取父上下文 -->
  <!-- config 整体传递 + config.props 展开为独立 props（字段组件可直接接收） -->
  <component
    v-if="resolvedComponent"
    :is="resolvedComponent"
    :config="config"
    v-bind="forwardedProps"
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
 * SparkComponentRenderer — SPARK 通用组件递归渲染引擎（无上下文版本）
 *
 * 职责：
 * 1. 从注册表解析 config.type → Vue 组件
 * 2. 递归渲染子组件树
 * 3. 未注册组件降级显示警告（不抛出异常）
 *
 * 设计要点：
 * - **不创建自己的 ComponentContext**：渲染器是透明的路由层，不加入能力链
 * - 直接 inject(SPARK_REGISTRY_KEY) 获取注册表，不经过 useSparkComponent
 * - 父子上下文传递完全依赖 Vue DI（业务组件的 useSparkComponent 自行 vueProvide）
 * - 根节点 / 测试场景通过 parentContext prop 显式注入初始父上下文
 *
 * 上下文链对比：
 *   旧：rootContext → rendererContext → businessContext  ← 多一层噪声
 *   新：rootContext → businessContext                   ← 干净
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
import { computed, inject, markRaw, provide as vueProvide } from 'vue'
import { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '../../core/types.js'
import type { ComponentConfig, ComponentContext, ComponentRegistry } from '../../core/types.js'

const LAYOUT_ONLY_PROP_KEYS = new Set(['colSpan', 'rowSpan', 'gridColSpan', 'gridRowSpan', 'span'])

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** 组件配置（type + props + children） */
  config: ComponentConfig
  /**
   * 显式父上下文（可选）
   * 仅用于根节点 / 测试场景：将其注入 DI 链，子业务组件 inject 时自动获取。
   * 普通递归渲染无需传递，子组件继承已有的 DI 链。
   */
  parentContext?: ComponentContext
}

const props = defineProps<Props>()

// ── 根节点 / 测试场景：覆盖 DI 链的父上下文 ─────────────────────────────────
// 业务组件的 useSparkComponent 会通过 inject(SPARK_PARENT_CONTEXT_KEY) 消费此值
if (props.parentContext !== undefined) {
  vueProvide(SPARK_PARENT_CONTEXT_KEY, props.parentContext)
}

// ── 注册表（直接 inject，不经过 useSparkComponent）───────────────────────────
const registry = inject<ComponentRegistry | undefined>(SPARK_REGISTRY_KEY, undefined)

// ── 组件解析 ──────────────────────────────────────────────────────────────────

const resolvedComponent = computed(() => {
  const def = registry?.get(props.config.type)
  if (!def) {
   if (import.meta.env.DEV) {
     console.warn(`[SparkComponentRenderer] 未注册的组件类型: ${props.config.type}`)
   }
   return null
  }
  return def.component ? markRaw(def.component as object) : null
})

const forwardedProps = computed(() => {
  const rawProps = props.config.props ?? {}
  return Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => !LAYOUT_ONLY_PROP_KEYS.has(key))
  )
})
</script>
