<template>
  <!-- 已注册：SparkNode 运行时输入 + 事件处理器 → 统一作为 Vue Props 传递 -->
  <component
    v-if="registryComponent"
    :is="registryComponent"
    v-bind="componentProps"
  />

  <!-- 非 registry 组件（Vue 全局组件 / 原生标签）：统一走 attrs + slot children -->
  <component
    v-else-if="externalComponent"
    :is="externalComponent"
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
      <strong>⚠️ 未注册的组件类型:</strong> {{ normalizedConfig.type }}
    </div>
    <!-- 未注册时仍递归渲染子组件，父能力上下文由框架内部传递 -->
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
 * - 父能力上下文通过框架内部私有 DI 传递，不对外暴露公共 key
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
import { SPARK_REGISTRY_KEY, nodeId, nodeDock, DEFAULT_DOCK, isSparkNode, normalizeSparkNode } from '../types.js'
import type { SparkNode, SparkNodeChildren, ComponentContext, ComponentRegistry } from '../types.js'
import { INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY } from '../internal/capability-context.js'

// h() 模型：on 由渲染器拦截转为 onXxx 事件 props，不直接透传
// layout/dock/order 只服务于容器布局，不透传到组件 props / DOM
const FILTERED_PROP_KEYS = new Set(['colSpan', 'rowSpan', 'gridColSpan', 'gridRowSpan', 'span', 'on', 'dock', 'order'])
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

function normalizeRenderableChildren(children: SparkNodeChildren | undefined): RenderableChild[] {
  if (!Array.isArray(children) || children.length === 0) return []

  const normalized: RenderableChild[] = []
  for (const child of children) {
    if (isSparkNode(child)) {
      if (nodeDock(child) === DEFAULT_DOCK) {
        normalized.push(child)
      }
      continue
    }
    if (typeof child === 'string') {
      normalized.push(child)
    }
  }
  return normalized
}

function nodeKey(child: RenderableChild, index: number): string {
  if (!isSparkNode(child)) return `text-${index}`
  return nodeId(child) ?? `child-${index}`
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
const normalizedConfig = computed<SparkNode>(() => normalizeSparkNode(props.config, 'unknown'))

// ── 根节点 / 测试场景：覆盖框架内部父能力上下文 ─────────────────────────────
if (props.parentContext !== undefined) {
  vueProvide(INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY, props.parentContext)
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

const configType = computed(() => {
  const type = normalizedConfig.value.type
  return typeof type === 'string' && type.length > 0 ? type : null
})

const nativeRenderableTag = computed(() => {
  const type = configType.value
  return type !== null && isNativeRenderableType(type) ? type : null
})

const renderableChildren = computed<RenderableChild[]>(() => {
  return normalizeRenderableChildren(normalizedConfig.value.children)
})

// ── 组件解析 ──────────────────────────────────────────────────────────────────

const registryDefinition = computed(() => {
  const type = configType.value
  return type !== null ? (registry?.get(type) ?? null) : null
})

const registryComponent = computed(() => {
  const def = registryDefinition.value
  if (def) {
    return def.component ? markRaw(def.component as object) : null
  }

  return null
})

const externalComponent = computed(() => {
  if (registryDefinition.value !== null) return null

  const type = configType.value
  if (type === null) return null

  const appComponent = resolveFromVueContext(type)
  if (appComponent) {
    return markRaw(appComponent as object)
  }

  if (nativeRenderableTag.value !== null) {
    return nativeRenderableTag.value
  }

  if (import.meta.env.DEV) {
    console.warn(`[SparkComponentRenderer] 未注册的组件类型: ${type}`)
  }
  return null
})

function hasFilteredKeys(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (FILTERED_PROP_KEYS.has(key)) return true
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
  const config = normalizedConfig.value
  const rawProps = config.props ?? {}
  // 属性是唯一真相：渲染器只消费 config.props，不再兼容根级输入合并。
  const onMap = rawProps['on']

  // fast-path: 叶子组件大多无事件绑定且无 layout/framework key，直接返回原引用
  const hasEvents = onMap !== null && onMap !== undefined && typeof onMap === 'object' && Object.keys(onMap as Record<string, unknown>).length > 0
  if (!hasEvents && !hasFilteredKeys(rawProps)) return rawProps

  // slow-path: 过滤 layout/framework keys + 合并事件 props
  const eventProps = hasEvents
    ? Object.fromEntries(
        Object.entries(onMap as Record<string, unknown>).map(([eventName, handler]) => [toListenerPropName(eventName), handler])
      )
    : undefined

  const filteredProps = Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => !FILTERED_PROP_KEYS.has(key))
  )

  return eventProps ? { ...filteredProps, ...eventProps } : filteredProps
})

/**
 * 已注册组件的完整 Props = forwardedProps + 必要的 SparkNode 结构字段。
 *
 * 对齐运行时约束：
 *   - 业务输入 → config.props
 *   - 结构输入 → type / id / children
 *
 * `dock/order` 属于父容器布局元数据（父容器通过 getDockedChildren 在渲染前已消费），
 * 不应透传到业务组件——否则会继续作为 fallthrough attrs 污染到根子组件。
 *
 * 仅用于 registry 组件分支；原生标签 / 未注册组件仍使用 forwardedProps（避免 DOM 属性污染）。
 */
const componentProps = computed(() => {
  const base = forwardedProps.value
  const config = props.config
  // 仅对 registry 组件透传 children prop；
  // 全局组件（如 Element Plus）不接收该 prop，透传会污染到底层 DOM。
  if (registryDefinition.value === null) return base
  const extra: Record<string, unknown> = {}
  extra['type'] = config.type
  if (config.id !== undefined) extra['id'] = config.id
  if (config.children !== undefined) extra['children'] = config.children
  return Object.keys(extra).length > 0 ? { ...base, ...extra } : base
})
</script>
