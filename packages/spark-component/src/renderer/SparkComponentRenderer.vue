<template>
  <!-- 已注册：SparkNode 根级字段 + config.props + 事件处理器 → 统一作为 Vue Props 传递 -->
  <component
    v-if="resolvedComponent"
    :is="resolvedComponent"
    v-bind="componentProps"
  />

  <!-- 未注册但可识别为原生标签：按原生元素渲染，并继续递归子节点 -->
  <component
    v-else-if="shouldRenderAsNativeElement"
    :is="config.type"
    v-bind="forwardedProps"
  >
    <template
      v-for="(child, index) in renderableChildren"
      :key="nodeKey(child, index)"
    >
      <SparkComponentRenderer
        v-if="isSparkNode(child)"
        :config="child"
      />
      <template v-else>
        {{ child }}
      </template>
    </template>
  </component>

  <!-- 未注册：降级渲染，继续递归子组件树，不中断渲染 -->
  <div
    v-else
    class="spark-component-renderer spark-component-unregistered"
  >
    <div class="unregistered-warning">
      <strong>⚠️ 未注册的组件类型:</strong> {{ config.type }}
    </div>
    <!-- 未注册时仍递归渲染子组件，父上下文由 Vue DI 自动传递 -->
    <template
      v-for="(child, index) in renderableChildren"
      :key="nodeKey(child, index)"
    >
      <SparkComponentRenderer
        v-if="isSparkNode(child)"
        :config="child"
      />
      <template v-else>
        {{ child }}
      </template>
    </template>
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
import { computed, inject, markRaw, provide as vueProvide, resolveDynamicComponent } from 'vue'
import { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '../types.js'
import type { SparkNode, ComponentContext, ComponentRegistry } from '../types.js'

const LAYOUT_ONLY_PROP_KEYS = new Set(['colSpan', 'rowSpan', 'gridColSpan', 'gridRowSpan', 'span'])
// h() 模型：on 由渲染器拦截转为 onXxx 事件 props，不直接透传
const _FILTERABLE_KEYS = new Set([...LAYOUT_ONLY_PROP_KEYS, 'on'])
const NATIVE_RENDERABLE_TAGS = new Set([
  'div', 'span', 'p', 'a', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'button', 'input', 'textarea', 'select', 'option', 'label', 'form',
  'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'colgroup', 'col', 'caption',
  'br', 'hr', 'pre', 'code',
  'strong', 'em', 'i', 'b', 'small', 'sub', 'sup', 'blockquote',
  'dl', 'dt', 'dd',
  'figure', 'figcaption',
  'video', 'audio', 'source',
  'canvas',
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text',
])
type RenderableChild = SparkNode | string | number

function nodeKey(child: RenderableChild, index: number): string {
  if (!isSparkNode(child)) return `text-${index}`
  const id = child.props?.['id']
  return typeof id === 'string' ? id : `child-${index}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** 组件配置（type + props + children） */
  config: SparkNode
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

function isNativeRenderableType(type: string): boolean {
  return NATIVE_RENDERABLE_TAGS.has(type)
}

function resolveFromVueContext(type: string): unknown {
  const resolved = resolveDynamicComponent(type)
  return typeof resolved === 'string' ? null : resolved
}

function isSparkNode(value: unknown): value is SparkNode {
  return value !== null
    && typeof value === 'object'
    && 'type' in value
    && typeof (value as { type?: unknown }).type === 'string'
}

const shouldRenderAsNativeElement = computed(() => isNativeRenderableType(props.config.type))

const renderableChildren = computed<RenderableChild[]>(() => {
  const children: unknown[] = props.config.children ?? []

  return children.filter((child): child is RenderableChild => (
    isSparkNode(child) || typeof child === 'string' || typeof child === 'number'
  ))
})

// ── 组件解析 ──────────────────────────────────────────────────────────────────

const registryDefinition = computed(() => registry?.get(props.config.type) ?? null)

const resolvedComponent = computed(() => {
  const def = registryDefinition.value
  if (def) {
    return def.component ? markRaw(def.component as object) : null
  }

  const appComponent = resolveFromVueContext(props.config.type)
  if (appComponent) {
    return markRaw(appComponent as object)
  }

  if (import.meta.env.DEV && !isNativeRenderableType(props.config.type)) {
    
    console.warn(`[SparkComponentRenderer] 未注册的组件类型: ${props.config.type}`)
  }
  return null
})

function _hasFilterableKeys(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (_FILTERABLE_KEYS.has(key)) return true
  }
  return false
}

const _listenerNameCache = new Map<string, string>()
function toListenerPropName(eventName: string): string {
  let cached = _listenerNameCache.get(eventName)
  if (cached !== undefined) return cached
  const normalized = eventName.replace(/[:\-]([a-zA-Z])/g, (_, char: string) => char.toUpperCase())
  cached = `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
  _listenerNameCache.set(eventName, cached)
  return cached
}

const forwardedProps = computed(() => {
  const config = props.config
  const rawProps = config.props ?? {}
  // h() 模型：on 从 props 中读取（bindSparkRuleEvents 已将根级 on 收入 props）
  const onMap = rawProps['on']

  // fast-path: 叶子组件大多无事件绑定且无 layout/framework key，直接返回原引用
  const hasEvents = onMap !== null && onMap !== undefined && typeof onMap === 'object' && Object.keys(onMap as Record<string, unknown>).length > 0
  if (!hasEvents && !_hasFilterableKeys(rawProps)) return rawProps

  // slow-path: 过滤 layout/framework keys + 合并事件 props
  const eventProps = hasEvents
    ? Object.fromEntries(
        Object.entries(onMap as Record<string, unknown>).map(([eventName, handler]) => [toListenerPropName(eventName), handler])
      )
    : undefined

  const filteredProps = Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => !_FILTERABLE_KEYS.has(key))
  )

  return eventProps ? { ...filteredProps, ...eventProps } : filteredProps
})

/**
 * 已注册组件的完整 Props = forwardedProps + children。
 *
 * 对齐 h(type, props, children) 模型：
 *   - props  → forwardedProps（含绑定阶段规范化后的 dataKey/field/label 等）
 *   - children → SparkNode.children（类型化，直接转发）
 * 仅用于已注册组件分支；原生标签 / 未注册组件仍使用 forwardedProps（避免 DOM 属性污染）。
 */
const componentProps = computed(() => {
  const base = forwardedProps.value
  const children = props.config.children
  // 仅对 registry 组件透传 children prop；
  // 全局组件（如 Element Plus）不接收该 prop，透传会污染到底层 DOM。
  if (registryDefinition.value === null) return base
  return children !== undefined ? { ...base, children } : base
})
</script>
