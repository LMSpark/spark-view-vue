<template>
  <!-- 已注册：SparkNode 运行时输入 + 事件处理器 → 统一作为 Vue Props 传递 -->
  <component
    v-if="shouldRenderRegistryComponent"
    v-bind="registryComponentProps"
    :is="registryComponent"
  >
    <template v-if="shouldRenderRegistryDefaultSlot" #default>
      <RecursiveChildrenBlock :children="renderableChildren" />
    </template>
  </component>

  <!-- 非 registry 组件（Vue 全局组件 / 原生标签）：统一走 attrs + slot children -->
  <component
    v-else-if="shouldRenderExternalComponent"
    :is="externalComponent"
    v-bind="externalComponentProps"
  >
    <template v-if="shouldRenderExternalDefaultSlot">
      <RecursiveChildrenBlock :children="renderableChildren" />
    </template>
  </component>

  <!-- 未注册：降级渲染卡片负责提示外观与属性面板，子组件树仍继续递归 -->
  <UnregisteredNodeFallback
    v-else-if="shouldRenderUnregisteredFallback"
    :node="effectiveNode"
    :title="fallbackTitle"
    :description="fallbackDescription"
  >
    <!-- 未注册时仍递归渲染子组件，父能力上下文由框架内部传递 -->
    <RecursiveChildrenBlock v-if="hasRenderableChildren" :children="renderableChildren" />
  </UnregisteredNodeFallback>
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
 * - 父能力上下文通过运行时实例锚点表发现，不依赖 Vue provide/inject
 * - 根节点 / 测试场景通过 parentContext prop 显式挂载初始父上下文
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
import {
  cloneVNode,
  computed,
  createTextVNode,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  markRaw,
  onUnmounted,
  resolveDynamicComponent,
} from 'vue'
import type { PropType } from 'vue'
import type { IDataRow, IDataSource } from '@spark-view/spark-data'
import UnregisteredNodeFallback from './support/UnregisteredNodeFallback.vue'
import { resolveSparkHost } from '../core/useSparkHost.js'
import {
  nodeId,
  isSparkNode,
  normalizeSparkNode,
} from '../core/types.js'
import type { SparkNode, SparkNodeChildren, SparkCapabilityContext, ComponentRegistry, ComponentChildrenMode } from '../core/types.js'
import { SPARK_REGISTRY_KEY } from '../system/keys.js'
import { DATA_ROW, DATA_SOURCE, consumeSparkCapability } from '../core/capabilities.js'
import { bindCapabilityContextOwner, resolveParentCapabilityContext, unbindCapabilityContextOwner, type SparkRuntimeOwner } from '../internal/capability-context.js'
import type { BeforeRenderContext } from './support/beforeRender.js'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from './support/beforeRender.js'
import { extractModelPermission } from '../permission/index.js'

// ── 常量与局部类型：渲染器内部约束、运行时局部类型 ───────────────────────────

// h() 模型下，以下字段属于渲染器/布局层语义，不直接透传到业务组件。
const FILTERED_PROP_KEYS = new Set(['colSpan', 'rowSpan', 'gridColSpan', 'gridRowSpan', 'span', 'on', 'onBeforeRender', 'dock', 'order'])

// 原生标签不应该收到这些运行时作用域字段，否则会污染 DOM attrs。
const NATIVE_ONLY_FILTERED_PROP_KEYS = new Set(['row', 'rowIndex', 'data', 'dataSource', 'modelPermission', 'model'])

// 允许直接降级为原生标签渲染的白名单。
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
type RecursiveChildrenList = RenderableChild[]
type NodeRuntimeProps = Record<string, unknown>
type RenderBranch = 'hidden' | 'registry' | 'external' | 'fallback'
type ParentCapabilityContext = SparkCapabilityContext | null
type ParentTypeConstraintState = {
  matched: boolean
  expectedTypes: string[]
  actualTypes: string[]
}
type ScopedRuntimeInput = {
  rawProps: NodeRuntimeProps
  parentContext: ParentCapabilityContext
}
type ResolvedBeforeRenderContext = Omit<BeforeRenderContext, 'id' | 'type' | 'props' | 'children'>

// Vue 组件 props 声明有两种常见形态：数组或对象。
type DeclaredProps = NodeRuntimeProps | string[]

interface VueComponentLike {
  props?: DeclaredProps
  __vccOpts?: {
    props?: DeclaredProps
  }
}

// 复用空对象常量，避免多个 computed 在“无 props”场景反复制造新引用。
const EMPTY_RUNTIME_PROPS = Object.freeze({}) as NodeRuntimeProps

// ── 渲染器输入：外部只传节点本体与可选父上下文 ───────────────────────────────

interface RendererProps {
  /**
   * 被渲染的节点本体。
   *
   * 这里保留为整体 SparkNode，而不是把 type/props/children 平铺成渲染器自己的 props，
   * 目的是让“节点 AST”和“渲染器控制参数”分层，避免再次引入根级兼容合并。
   */
  config: SparkNode
  /**
   * 显式父上下文（可选）。
   *
   * 仅用于根节点 / 测试场景：将其挂到当前 renderer 实例，子业务组件沿父实例链自动发现。
   * 普通递归渲染无需传递，子组件继承已有的 SparkContext 结构树。
   */
  parentContext?: SparkCapabilityContext
}

const rendererProps = defineProps<RendererProps>()
const currentInstance = getCurrentInstance()
const currentOwner = currentInstance as SparkRuntimeOwner | null
// 保存当前渲染器组件类型，供本地递归块继续回到同一个渲染入口。
const currentRendererComponent = currentInstance?.type ?? null

// ── 基础工具：子节点归一与递归渲染 ───────────────────────────────────────────

/**
 * children 归一：
 * 1. 保留 SparkNode 子节点（dock area 子节点已通过 dock props 由父容器消费，不再进入默认流）。
 * 2. 保留字符串/数字字面量，供统一 slot / fallback 路径直接渲染成文本节点。
 */
function normalizeRenderableChildren(children: SparkNodeChildren | undefined): RenderableChild[] {
  if (!Array.isArray(children) || children.length === 0) return []

  const normalized: RenderableChild[] = []
  for (const child of children) {
    if (isSparkNode(child)) {
      normalized.push(child)
      continue
    }
    if (typeof child === 'string' || typeof child === 'number') {
      normalized.push(child)
    }
  }
  return normalized
}

function nodeKey(child: RenderableChild, index: number): string {
  if (!isSparkNode(child)) return `text-${index}`
  return nodeId(child) ?? `child-${index}`
}

function renderRecursiveChild(child: RenderableChild, index: number) {
  const key = nodeKey(child, index)
  if (!isSparkNode(child)) {
    return cloneVNode(createTextVNode(String(child)), { key })
  }

  // 理论上 currentRendererComponent 总是存在；这里保守兜底，避免异常环境下抛错。
  if (currentRendererComponent === null) {
    return null
  }
  return h(currentRendererComponent, { key, config: child })
}

/**
 * 递归 child 渲染块：
 * - 把模板里重复的 SparkNode / 文本子节点渲染逻辑集中到一处。
 * - SparkNode 子节点会重新交回 SparkComponentRenderer 处理，确保注册表解析、beforeRender、权限逻辑继续生效。
 * - 文本子节点输出为 text vnode，保持“无额外包裹标签”的渲染结果。
 */
const RecursiveChildrenBlock = defineComponent({
  name: 'RecursiveChildrenBlock',
  props: {
    children: {
      type: Array as PropType<RecursiveChildrenList>,
      required: true,
    },
  },
  setup(props) {
    // 本地小组件本身不持有业务上下文，只负责把子节点重新路由回渲染器入口。
    return () => props.children.map(renderRecursiveChild)
  },
})

// ── 基础工具：组件声明识别与 registry 协商 ─────────────────────────────────

/**
 * 读取组件 props 声明。
 *
 * 兼容两种来源：
 * 1. 普通组件对象直接暴露的 props
 * 2. SFC 编译产物挂在 __vccOpts 上的原始 props
 *
 * 该函数只用于判断组件是否显式声明某个 prop，不参与真实 props 合并。
 */
function readDeclaredProps(component: unknown): DeclaredProps | null {
  if (component === null || component === undefined) return null
  if (typeof component !== 'object' && typeof component !== 'function') return null

  // 兼容两种来源：普通组件选项对象，或 SFC 编译产物挂在 __vccOpts 上的原始选项。
  const normalizedComponent = component as VueComponentLike
  return normalizedComponent.props ?? normalizedComponent.__vccOpts?.props ?? null
}

// 渲染器内部统一的诊断输出入口，避免 beforeRender / 未注册分支各自散落 console.warn。
function warnRendererIssue(message: string, error?: unknown): void {
  if (!import.meta.env.DEV) return
  if (error === undefined) {
    console.warn(`[SparkComponentRenderer] ${message}`)
    return
  }
  console.warn(`[SparkComponentRenderer] ${message}`, error)
}

// 判断目标组件是否显式声明某个 prop，用于 children prop / slot 协商。
function declaresProp(component: unknown, propName: string): boolean {
  const declaredProps = readDeclaredProps(component)
  if (declaredProps === null) return false
  if (Array.isArray(declaredProps)) return declaredProps.includes(propName)
  return propName in declaredProps
}

// registry 元信息允许显式指定 children 协商模式；未指定时回退到自动探测。
function resolveChildrenMode(meta: NodeRuntimeProps | undefined): ComponentChildrenMode {
  const value = meta?.['childrenMode']
  return value === 'prop' || value === 'slot' ? value : 'auto'
}

function readParentTypeConstraints(meta: NodeRuntimeProps | undefined): string[] {
  const rawValue = meta?.['parentTypes'] ?? meta?.['hostTypes']
  if (typeof rawValue === 'string') {
    return rawValue.length > 0 ? [rawValue] : []
  }

  if (!Array.isArray(rawValue)) return []

  return rawValue.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function collectParentTypeChain(parentContext: ParentCapabilityContext): string[] {
  const chain: string[] = []
  let currentContext = parentContext

  while (currentContext !== null) {
    if (typeof currentContext.type === 'string' && currentContext.type.length > 0) {
      chain.push(currentContext.type)
    }
    currentContext = currentContext.parent ?? null
  }

  return chain
}

function resolveParentTypeConstraintState(
  meta: NodeRuntimeProps | undefined,
  parentContext: ParentCapabilityContext,
): ParentTypeConstraintState {
  const expectedTypes = readParentTypeConstraints(meta)
  if (expectedTypes.length === 0) {
    return {
      matched: true,
      expectedTypes: [],
      actualTypes: [],
    }
  }

  const resolvedHost = resolveSparkHost(parentContext?.type ?? null, parentContext, {
    hostTypes: expectedTypes,
  })

  return {
    matched: resolvedHost.hostType !== null,
    expectedTypes,
    actualTypes: collectParentTypeChain(parentContext),
  }
}

// ── 基础工具：渲染时作用域数据解析 ─────────────────────────────────────────

// 从 unknown 中识别行对象；只接受对象，不接受数组或原始值。
function asDataRow(value: unknown): IDataRow | null {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? value as IDataRow
    : null
}

// 从 unknown 中识别 IDataSource；供 beforeRender、字段作用域和权限快照读取复用。
function asDataSource(value: unknown): IDataSource | null {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? value as IDataSource
    : null
}

// 行索引既可能来自 rowIndex，也可能来自部分旧作用域兼容保留的 $index。
function resolveScopedRowIndex(rawProps: NodeRuntimeProps): number | undefined {
  if (typeof rawProps['rowIndex'] === 'number') return rawProps['rowIndex']
  return typeof rawProps['$index'] === 'number' ? rawProps['$index'] : undefined
}

// dataSource 优先取节点显式注入，其次沿父能力链回溯 DATA_SOURCE。
function resolveScopedDataSource({ rawProps, parentContext }: ScopedRuntimeInput): IDataSource | null {
  return asDataSource(rawProps['dataSource'])
    ?? consumeSparkCapability<IDataSource>(parentContext, DATA_SOURCE)
}

// row 优先取节点局部作用域，其次退回 data，再次沿父能力链回溯 DATA_ROW。
function resolveScopedRow({ rawProps, parentContext }: ScopedRuntimeInput): IDataRow | null {
  return asDataRow(rawProps['row'])
    ?? asDataRow(rawProps['data'])
    ?? consumeSparkCapability<IDataRow>(parentContext, DATA_ROW)
}

/**
 * 构造 beforeRender 所需的上下文快照。
 *
 * 这里把作用域数据解析集中到一个 helper 里，避免 computed 主体里既做状态流转又做上下文拼装。
 */
function buildBeforeRenderContext({ rawProps, parentContext }: ScopedRuntimeInput): ResolvedBeforeRenderContext {
  const dataSource = resolveScopedDataSource({ rawProps, parentContext })
  const row = resolveScopedRow({ rawProps, parentContext })

  return {
    row,
    data: rawProps['data'] ?? row,
    index: resolveScopedRowIndex(rawProps),
    dataSource,
    modelPermission: extractModelPermission(dataSource),
    parentType: parentContext?.type ?? null,
  }
}

// ── 基础工具：props 透传与事件映射 ──────────────────────────────────────────

/**
 * 把 SparkNode.props 转成真正要下发给目标组件的 props：
 * - 过滤渲染器内部保留键
 * - 把 on.xxx 映射成 Vue listener props
 * - 保留 fast-path，尽量复用原始对象引用
 */
function buildNodeForwardedProps(rawProps: NodeRuntimeProps): NodeRuntimeProps {
  const onMap = rawProps['on']
  const hasEvents = isNonEmptyRecord(onMap)

  // fast-path：叶子节点通常无事件且无框架保留键，直接复用原引用即可。
  if (!hasEvents && !hasFilteredKeys(rawProps)) return rawProps

  const filteredProps = filterForwardableProps(rawProps)
  if (!hasEvents) return filteredProps

  return {
    ...filteredProps,
    ...buildForwardedEventProps(onMap),
  }
}

// 已注册组件额外收到的结构字段，只在 registry 分支透传。
// SparkNode 四字段（type / props / children / id）全部在此向下桥接：
//   type    → 组件 context.type
// 已注册组件额外收到的结构字段，只在 registry 分支透传。
function buildRegistryStructuralProps(
  node: SparkNode,
  consumesChildrenProp: boolean,
): NodeRuntimeProps {
  const structuralProps: NodeRuntimeProps = {
    type: node.type,
  }

  if (node.id !== undefined) {
    structuralProps['id'] = node.id
  }

  if (consumesChildrenProp && Array.isArray(node.children) && node.children.length > 0) {
    structuralProps['children'] = node.children
  }

  return structuralProps
}

// 外部组件与原生标签共用一套入口，原生标签会额外过滤掉不该落到 DOM 的作用域字段。
function buildExternalComponentProps(
  rawProps: NodeRuntimeProps,
  isNativeTag: boolean,
): NodeRuntimeProps {
  return isNativeTag ? filterNativeDomProps(rawProps) : rawProps
}

// 原生标签只允许白名单，避免任意字符串都被当作 DOM tag 透传出去。
function isNativeRenderableType(type: string): boolean {
  return NATIVE_RENDERABLE_TAGS.has(type)
}

// 除 registry 外，再尝试从当前 Vue 应用上下文解析全局组件。
function resolveFromVueContext(type: string): unknown {
  const resolved = resolveDynamicComponent(type)
  return typeof resolved === 'string' ? null : resolved
}

// props 透传辅助：过滤框架保留键，并把事件映射为 Vue listener props。

// 判断 props 中是否存在任何渲染器保留字段，用于 fast-path 复用原始对象。
function hasFilteredKeys(obj: NodeRuntimeProps): boolean {
  for (const key of Object.keys(obj)) {
    if (FILTERED_PROP_KEYS.has(key) || key.startsWith('$')) return true
  }
  return false
}

// 仅把“非空对象”视为事件 map，避免把 null / 原始值误判成可展开对象。
function isNonEmptyRecord(value: unknown): value is NodeRuntimeProps {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && Object.keys(value as NodeRuntimeProps).length > 0
}

const _listenerNameCache = new Map<string, string>()

// 把脚本事件名转换为 Vue listener prop 名，例如 click -> onClick、row-click -> onRowClick。
function toListenerPropName(eventName: string): string {
  let cached = _listenerNameCache.get(eventName)
  if (cached !== undefined) return cached

  const normalized = eventName.replace(/[:\-]([a-zA-Z])/g, (_, char: string) => char.toUpperCase())
  cached = `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
  _listenerNameCache.set(eventName, cached)
  return cached
}

// 统一把 on.xxx 映射成真正的 Vue listener props 对象。
function buildForwardedEventProps(eventMap: NodeRuntimeProps): NodeRuntimeProps {
  return Object.fromEntries(
    Object.entries(eventMap).map(([eventName, handler]) => [toListenerPropName(eventName), handler])
  )
}

// 过滤渲染器保留字段，得到可以直接透传给组件的业务 props。
function filterForwardableProps(rawProps: NodeRuntimeProps): NodeRuntimeProps {
  return Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => !FILTERED_PROP_KEYS.has(key) && !key.startsWith('$'))
  )
}

// 原生 DOM 分支进一步过滤掉运行时作用域字段，避免污染真实 DOM attrs。
function filterNativeDomProps(rawProps: NodeRuntimeProps): NodeRuntimeProps {
  return Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => !NATIVE_ONLY_FILTERED_PROP_KEYS.has(key))
  )
}

// ── 渲染器运行时锚点：父能力上下文与注册表入口 ──────────────────────────────

// 根节点 / 测试场景：显式把父能力上下文锚到当前 renderer 实例上。
if (rendererProps.parentContext !== undefined && currentInstance !== null) {
  bindCapabilityContextOwner(currentInstance, rendererProps.parentContext)
  onUnmounted(() => {
    unbindCapabilityContextOwner(currentInstance)
  })
}

// 渲染器只直接消费注册表，不创建自己的业务能力上下文。
const registry = inject<ComponentRegistry | undefined>(SPARK_REGISTRY_KEY, undefined)

// ── SparkNode 处理管线：输入节点 → beforeRender → 生效节点 ───────────────────

// 归一化后的输入节点：补默认 type / children。
const normalizedNode = computed<SparkNode>(() => normalizeSparkNode(rendererProps.config, 'unknown'))

// 归一化节点 props：供 beforeRender 上下文构造使用。
const normalizedNodeProps = computed<NodeRuntimeProps>(() => normalizedNode.value.props ?? EMPTY_RUNTIME_PROPS)

// 通过运行时实例锚点表解析父能力上下文，不走 Vue provide/inject。
const parentCapabilityContext = computed(() =>
  resolveParentCapabilityContext(currentOwner, rendererProps.parentContext)
)

/**
 * beforeRender 状态：
 * - 只针对当前节点执行一次
 * - 产出 visible 与 propsPatch
 * - 所有后续分支都基于这份结果继续工作
 */
const beforeRenderState = computed(() => {
  const node = normalizedNode.value
  const parentContext = parentCapabilityContext.value

  return resolveNodeBeforeRender(
    node,
    buildBeforeRenderContext({
      rawProps: normalizedNodeProps.value,
      parentContext,
    }),
    warnRendererIssue,
  )
})

// 生效节点：把 beforeRender 的 patch 合并回 SparkNode，后续解析都基于它。
const effectiveNode = computed<SparkNode>(() =>
  mergeNodeBeforeRenderProps(normalizedNode.value, beforeRenderState.value.propsPatch)
)

// 生效节点 props：供最终 props 透传与外部/native 分支共用。
const effectiveNodeProps = computed<NodeRuntimeProps>(() => effectiveNode.value.props ?? EMPTY_RUNTIME_PROPS)

// 当前节点是否应该继续进入组件解析分支；后续 registry/external/fallback 都以它为前置条件。
const shouldRenderNode = computed(() => beforeRenderState.value.visible)

// ── 组件解析：registry 组件 / 全局组件 / 原生标签 / 未注册降级 ────────────────

// 当前节点 type 最终来源于 beforeRender 合并后的 effectiveNode。
const resolvedNodeType = computed(() => {
  const type = effectiveNode.value.type
  return typeof type === 'string' && type.length > 0 ? type : null
})

// 先看 registry；renderer 的第一职责是把 SparkNode.type 解析成真实组件。
const registryDefinition = computed(() => {
  const type = resolvedNodeType.value
  return type !== null ? (registry?.get(type) ?? null) : null
})

const registryParentTypeState = computed<ParentTypeConstraintState>(() => {
  return resolveParentTypeConstraintState(registryDefinition.value?.meta, parentCapabilityContext.value)
})

const registryComponent = computed(() => {
  const definition = registryDefinition.value
  if (!definition) return null
  if (!registryParentTypeState.value.matched) return null
  return definition.component ? markRaw(definition.component as object) : null
})

// registry 没命中时，再尝试 Vue 全局组件 / 原生标签；都失败则进入 fallback。
const nativeRenderableTag = computed(() => {
  const type = resolvedNodeType.value
  return type !== null && isNativeRenderableType(type) ? type : null
})

const externalComponent = computed(() => {
  if (registryDefinition.value !== null) return null

  const type = resolvedNodeType.value
  if (type === null) return null

  const appComponent = resolveFromVueContext(type)
  if (appComponent) {
    return markRaw(appComponent as object)
  }

  if (nativeRenderableTag.value !== null) {
    return nativeRenderableTag.value
  }

  warnRendererIssue(`未注册的组件类型: ${type}`)
  return null
})

// ── 渲染分支：统一收敛成单一分支枚举 ────────────────────────────────────────

// 分支集中判定，模板只消费语义明确的 shouldRenderXxx，而不是再拼复杂条件。
const renderBranch = computed<RenderBranch>(() => {
  if (!shouldRenderNode.value) return 'hidden'
  if (registryComponent.value !== null) return 'registry'
  if (externalComponent.value !== null) return 'external'
  return 'fallback'
})
const shouldRenderRegistryComponent = computed(() => renderBranch.value === 'registry')
const shouldRenderExternalComponent = computed(() => renderBranch.value === 'external')
const shouldRenderUnregisteredFallback = computed(() => renderBranch.value === 'fallback')

const fallbackTitle = computed(() => {
  return registryDefinition.value !== null && !registryParentTypeState.value.matched
    ? '父组件类型不匹配'
    : '未注册的组件类型'
})

const fallbackDescription = computed(() => {
  if (registryDefinition.value === null || registryParentTypeState.value.matched) return ''

  const expected = registryParentTypeState.value.expectedTypes.join(' / ')
  const actual = registryParentTypeState.value.actualTypes.join(' / ')
  return `期望父链类型: ${expected}；当前父链类型: ${actual || '无'}`
})

// ── 子节点策略：哪些 child 继续递归，哪些 child 透传给目标组件 ──────────────

// 先把当前节点的 children 归一成 renderer 可消费的字面量 / SparkNode 列表。
const renderableChildren = computed<RenderableChild[]>(() =>
  normalizeRenderableChildren(effectiveNode.value.children)
)

// 模板里是否需要继续挂 RecursiveChildrenBlock。
const hasRenderableChildren = computed(() => renderableChildren.value.length > 0)

// childrenMode 是 registry 对 renderer 的显式协议，优先级高于组件 props 声明推断。
const registryChildrenMode = computed<ComponentChildrenMode>(() =>
  resolveChildrenMode(registryDefinition.value?.meta)
)

// registry 组件到底是吃 children prop，还是走默认 slot。
const registryConsumesChildrenProp = computed(() => {
  const component = registryComponent.value
  if (registryChildrenMode.value === 'prop') return true
  if (registryChildrenMode.value === 'slot') return false
  return component !== null && declaresProp(component, 'children')
})

// 只有 registry 组件才需要决定“children 走 prop 还是走 slot”。
const shouldRenderRegistryChildrenViaSlot = computed(() => {
  return renderBranch.value === 'registry'
    && hasRenderableChildren.value
    && !registryConsumesChildrenProp.value
})

const shouldRenderRegistryDefaultSlot = computed(() => {
  return shouldRenderRegistryChildrenViaSlot.value
})

const shouldRenderExternalDefaultSlot = computed(() => {
  return renderBranch.value === 'external'
    && hasRenderableChildren.value
})

// ── props 透传：SparkNode.props → 目标组件运行时 props ───────────────────────

// 所有组件共享的基础 props：从 SparkNode.props 过滤并规范化后得到。
const nodeForwardedProps = computed(() => buildNodeForwardedProps(effectiveNodeProps.value))

// 外部组件 / 原生标签实际收到的 props。
// 其中原生标签还要再过滤一层，避免运行时作用域字段落到 DOM attrs 上。
const externalComponentProps = computed(() => {
  return buildExternalComponentProps(
    nodeForwardedProps.value,
    nativeRenderableTag.value !== null,
  )
})

/**
 * 已注册组件的完整 Props = forwardedProps + 必要的 SparkNode 结构字段。
 *
 * 对齐运行时约束：
 *   - 业务输入 → config.props
 *   - 结构输入 → type / id / children
 *
 * dock 分区通过 wrapper 子节点（如 `r-toolbar` / `r-actions`）声明；
 * 这里仅做统一 props 透传，并保留对历史 `dock` / `order` 残余输入的过滤兜底。
 *
 * 仅用于 registry 组件分支；原生标签 / 未注册组件仍使用 forwardedProps（避免 DOM 属性污染）。
 */
const registryComponentProps = computed(() => {
  // 非 registry 分支不会消费结构字段，直接返回基础透传 props。
  if (renderBranch.value !== 'registry') return nodeForwardedProps.value

  return {
    ...nodeForwardedProps.value,
    ...buildRegistryStructuralProps(effectiveNode.value, registryConsumesChildrenProp.value),
  }
})
</script>
