<template>
  <div v-if="loading" class="spark-page-loading">
    <slot name="loading">加载中...</slot>
  </div>
  <div v-else-if="error" class="spark-page-error">
    <slot name="error" :error="error">
      <h3>❌ 页面加载失败</h3>
      <p>{{ error }}</p>
    </slot>
  </div>
  <div v-else>
    <!-- 动态注入页面样式（自动添加作用域） -->
    <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>

    <!-- 页面内容树（rule.json → buildPageChildren → children，递归渲染） -->
    <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
      <slot name="content" :children="children">
        <SparkComponentRenderer
          v-for="(child, i) in children"
          :key="nodeId(child) ?? `spark-child-${i}`"
          :config="child"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SparkPageRenderer — 页面级 h(type, props, children) 渲染器
 *
 * 对齐 h() 三段式模型（与 RendererTable / RendererForm 同构）：
 *   type     = 'spark-page'（Props extends SparkNode，withDefaults 设定）
 *   props    = configLoader / pageId / pageConfig / enable* / 钩子等
 *   children = rule.json 经 buildPageChildren() 归并后的 SparkNode[]（渲染器内部生成）
 *
 * spark-page-config 负责四文件契约与加载：
 *   rule / data / script / css 以中立配置形态进入渲染层
 *
 * spark-component 负责运行时物化：
 *   rule.json 是"声明式 children"
 *   加载 → buildPageChildren（严格 SparkNode 校验、事件绑定、ID 去重）
 *   → children（SparkNode[]）→ SparkComponentRenderer 递归渲染
 *
 * spark-page props 应用流水线（applyNodeProps）：
 *   1. css    → setScopedCss（作用域隔离注入）
 *   2. script → compileFunctions → registerRenderComponents
 *   3. data   → DataSet 初始化 → sparkProvide(PAGE_DATASET)
 *   4. rule   → buildPageChildren → children（驱动模板渲染）
 *
 * @component
 * @example
 * ```vue
 * <!-- 直传四文件 -->
 * <SparkPageRenderer :pageConfig="pageFiles" pageId="user-list" />
 *
 * <!-- configLoader + pageId -->
 * <SparkPageRenderer :configLoader="loader" pageId="user-list" />
 * ```
 */
import {
  cloneVNode,
  computed,
  ref,
  watch,
  nextTick,
  getCurrentInstance,
  shallowRef,
  defineComponent,
  markRaw,
  onErrorCaptured,
  onUnmounted,
  isVNode,
  type VNode,
  type VNodeArrayChildren,
} from 'vue'
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
import type { NavPermissionMode } from '../../core/capability-keys.js'
import type { DataSet } from '@spark-view/spark-data'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { SparkNodeTree } from '@spark-view/spark-page-config/page/spark-node-tree'
import type { BasePageConfigLoader, PageConfig } from '@spark-view/spark-page-config/page/loading'
import type { PageRoute } from '@spark-view/spark-page-config/page/script-context-types'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../core/types'
import { PAGE_DATASET } from '../../core/capability-keys'
import {
  PAGE_SERVICE,
  PAGE_PERMISSION_MODE,
} from '../../core/capability-keys.js'
import {
  MODULE_CONTEXT,
  CSS_SCOPE,
} from '../../core/capability-keys'
import type { PageCssScopeCapability } from '../../core/capability-keys'
import { useRendererSetup } from './useRendererSetup'
import { useCssScope } from './useCssScope'
import { usePageDataSet } from './usePageDataSet'
import { compileFunctions } from '../createSandbox'
import { buildPageService, type PageServiceOverrides } from '../services/buildPageService'
import { buildPageContext } from '../context/buildPageContext'
import { buildPageChildren } from '../binding'
import type { PageContext } from '../context/types'
import {
  sparkBindPageRootContext,
  sparkResolveContextOwner,
  sparkUnbindPageRootContext,
} from '../../core/capability-context.js'
import SparkComponentRenderer from '../../components/SparkComponentRenderer.vue'

const logger = Logger('SparkPageRenderer')
const currentInstance = getCurrentInstance()

type PageRuntimeErrorPhase = 'load' | 'script-compile' | 'init' | 'script-function' | 'render'

interface PageRuntimeErrorPayload {
  phase: PageRuntimeErrorPhase
  message: string
  pageId: string
  at: string
}

interface RenderFunction {
  (props?: Record<string, unknown>): unknown
}
interface RenderFunctionRef extends ReturnType<typeof shallowRef<RenderFunction | null>> {}
interface RenderFunctionRevisionRef extends ReturnType<typeof shallowRef<number>> {}
interface RenderFunctionRegistration {
  fnRef: RenderFunctionRef
  revisionRef: RenderFunctionRevisionRef
  invalidatePage?: () => void
}
const renderFunctionRegistries = new WeakMap<object, Map<string, RenderFunctionRegistration>>()

interface VueComponentRegistry {
  component(name: string): unknown
  component(name: string, component: object): void
}

function getRenderFunctionRegistry(app: object): Map<string, RenderFunctionRegistration> {
  const existing = renderFunctionRegistries.get(app)
  if (existing) return existing
  const created = new Map<string, RenderFunctionRegistration>()
  renderFunctionRegistries.set(app, created)
  return created
}

function invalidateRenderFunctionRegistration(registration: RenderFunctionRegistration): void {
  registration.revisionRef.value = (registration.revisionRef.value ?? 0) + 1
}

function isRenderEventProp(key: string, value: unknown): boolean {
  if (!key.startsWith('on') || key.length <= 2) return false
  if (key.startsWith('onVnode')) return false
  if (isCallable(value)) return true
  return Array.isArray(value) && value.some(isCallable)
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

function wrapRenderEventHandler(
  handler: (...args: unknown[]) => unknown,
  invalidate: () => void,
): (...args: unknown[]) => unknown {
  return function wrappedRenderEvent(this: unknown, ...args: unknown[]) {
    try {
      const result = handler.apply(this, args)
      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(invalidate)
      }
      invalidate()
      return result
    } catch (error) {
      invalidate()
      throw error
    }
  }
}

function wrapRenderEventProp(value: unknown, invalidate: () => void): unknown {
  if (isCallable(value)) {
    return wrapRenderEventHandler(value, invalidate)
  }
  if (Array.isArray(value)) {
    return value.map(item => isCallable(item)
      ? wrapRenderEventHandler(item, invalidate)
      : item)
  }
  return value
}

function wrapVNodeChildren(childrenValue: VNode['children'], invalidate: () => void): VNode['children'] {
  if (!Array.isArray(childrenValue)) return childrenValue
  return childrenValue.map(item => wrapVNodeArrayChild(item, invalidate))
}

function wrapVNodeArrayChild(child: VNodeArrayChildren[number], invalidate: () => void): VNodeArrayChildren[number] {
  if (Array.isArray(child)) {
    return child.map(item => wrapVNodeArrayChild(item, invalidate))
  }
  if (!isVNode(child)) return child
  return wrapScriptVNode(child, invalidate)
}

function wrapScriptRenderOutput(output: unknown, invalidate: () => void): unknown {
  if (Array.isArray(output)) {
    return output.map(item => wrapScriptRenderOutput(item, invalidate))
  }
  if (!isVNode(output)) return output

  return wrapScriptVNode(output, invalidate)
}

function wrapScriptVNode(vnode: VNode, invalidate: () => void): VNode {
  const cloned = cloneVNode(vnode)
  const props = cloned.props
  if (props) {
    let hasWrappedEvent = false
    const nextProps: Record<string, unknown> = { ...props }
    for (const [key, value] of Object.entries(props)) {
      if (!isRenderEventProp(key, value)) continue
      nextProps[key] = wrapRenderEventProp(value, invalidate)
      hasWrappedEvent = true
    }
    if (hasWrappedEvent) {
      cloned.props = nextProps
    }
  }

  cloned.children = wrapVNodeChildren(cloned.children, invalidate)

  return cloned
}

function invalidateRenderFunctionsForPage(
  app: object,
  pageFunctions: Record<string, (...args: unknown[]) => unknown>,
): void {
  const fnMap = getRenderFunctionRegistry(app)
  const invalidated = new Set<RenderFunctionRegistration>()
  for (const name of Object.keys(pageFunctions)) {
    if (!name.startsWith('Render')) continue
    const registration = fnMap.get(name)
    if (!registration || invalidated.has(registration)) continue
    invalidateRenderFunctionRegistration(registration)
    invalidated.add(registration)
  }
}

function createPageRoute(route: RouteLocationNormalizedLoaded): PageRoute {
  return {
    get path() { return route.path },
    get fullPath() { return route.fullPath },
    get name() { return route.name ?? null },
    get params() { return toPageRouteParams(route.params) },
    get query() { return toPageRouteQuery(route.query) },
    get hash() { return route.hash },
  }
}

function toPageRouteParams(params: RouteLocationNormalizedLoaded['params']): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') result[key] = value
    else if (Array.isArray(value)) result[key] = value.filter((item): item is string => typeof item === 'string')
  }
  return result
}

function toPageRouteQuery(query: RouteLocationNormalizedLoaded['query']): Record<string, string | string[] | null> {
  const result: Record<string, string | string[] | null> = {}
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' || value === null) result[key] = value
    else if (Array.isArray(value)) result[key] = value.filter((item): item is string => typeof item === 'string')
  }
  return result
}

function readRouteString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string' && item.length > 0)
  return undefined
}

function resolveCurrentPageId(
  route: RouteLocationNormalizedLoaded,
  pageId?: string,
  pageConfigPageId?: string,
): string {
  const resolved =
    pageId ??
    pageConfigPageId ??
    readRouteString(route.meta['pageId']) ??
    readRouteString(route.params['id']) ??
    readRouteString(route.name)
  if (!resolved) throw new Error('配置无效: 无法确定页面ID')
  return resolved
}

function registerRenderFunctionsForPage(
  app: VueComponentRegistry & object,
  pageFunctions: Record<string, (...args: unknown[]) => unknown>,
): void {
  const fnMap = getRenderFunctionRegistry(app)

  for (const [name, fn] of Object.entries(pageFunctions)) {
    if (!name.startsWith('Render') || typeof fn !== 'function') continue
    const camelName = name.charAt(0).toLowerCase() + name.slice(1)
    const invalidatePage = () => invalidateRenderFunctionsForPage(app, pageFunctions)
    const renderFunction = createRenderFunction(fn)

    const existingRef = fnMap.get(name) ?? fnMap.get(camelName)
    if (existingRef) {
      existingRef.fnRef.value = renderFunction
      existingRef.invalidatePage = invalidatePage
      fnMap.set(name, existingRef)
      fnMap.set(camelName, existingRef)
      invalidateRenderFunctionRegistration(existingRef)
      continue
    }

    const fnRef = shallowRef<RenderFunction | null>(renderFunction)
    const registration: RenderFunctionRegistration = {
      fnRef,
      revisionRef: shallowRef(0),
      invalidatePage,
    }
    fnMap.set(name, registration)
    fnMap.set(camelName, registration)

    const component = markRaw(defineComponent({
      name,
      setup: (_, { attrs }) => () => {
        registration.revisionRef.value
        const invalidate = () => {
          if (registration.invalidatePage) {
            registration.invalidatePage()
            return
          }
          invalidateRenderFunctionRegistration(registration)
        }
        return wrapScriptRenderOutput(registration.fnRef.value?.({ ...attrs }), invalidate)
      },
    }))
    app.component(name, component)
    app.component(camelName, component)
  }
}

function createRenderFunction(fn: (...args: unknown[]) => unknown): RenderFunction {
  return (propsBag?: Record<string, unknown>) => fn(propsBag)
}

// ==================== Props — h(type, props, children) ====================

/** 直传四文件输入（跳过 configLoader 异步加载，pageId 可选） */
interface SparkPageNodePropsInput extends Omit<PageConfig, 'pageId'> {
  pageId?: string
}

/**
 * SparkPageRenderer props — 对齐 h(type, props, children) 三段式。
 *
 * - type     = 'spark-page'（withDefaults 设定默认值）
 * - props    = configLoader / pageId / pageConfig / enable* / 钩子等（本接口所有字段）
 * - children = rule.json 经 buildPageChildren 归并后由渲染器内部生成，不作为外部输入
 */
interface Props extends Omit<SparkNode, 'type'> {
  /** 组件类型（withDefaults 默认 'spark-page'，外部调用无需显式传入） */
    type?: string
    /** 配置加载器实例（与 pageId 搭配，异步加载四文件） */
    configLoader?: BasePageConfigLoader
    /** 页面唯一标识符（优先级最高） */
    pageId?: string
    /** 页面配置对象（直接传入四文件，跳过加载） */
    pageConfig?: SparkPageNodePropsInput
    /** 是否启用 CSS 作用域隔离 @default true */
    enableCssScope?: boolean
    /** 是否启用 DataSet 自动初始化 @default true */
    enableDataSet?: boolean
    /** UI 消息服务接口 */
    messageService?: PageServiceOverrides['messageService']
    /** UI 确认对话框服务接口 */
    confirmService?: PageServiceOverrides['confirmService']
    /** 页面加载前钩子（loadNodeProps 之前） */
    beforeLoad?: (pageId: string) => void | Promise<void>
    /** 页面加载后钩子（applyNodeProps 之后） */
    afterLoad?: (config: PageConfig) => void | Promise<void>
    /** 错误处理函数 */
    onError?: (error: Error) => void
    /** 运行时错误回调（供外层采集脚本编译/初始化/加载错误）。 */
    onRuntimeError?: (payload: PageRuntimeErrorPayload) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'spark-page',
  enableDataSet: true,
  enableCssScope: true,
})

// ==================== 基础设施 ====================

const { router, sparkProvide, sparkConsume, loading, error, componentRegistry, pageRuntimeServices, runLoad } = useRendererSetup('spark-page', logger)
const route = useRoute()
const vueApp = currentInstance?.appContext.app
const moduleContextCapability = sparkConsume(MODULE_CONTEXT)

// PAGE_SERVICE
const pageService = buildPageService(router, {
  messageService: props.messageService,
  confirmService: props.confirmService,
  pageService: pageRuntimeServices.pageService,
})
sparkProvide(PAGE_SERVICE, pageService)

// ==================== 响应式状态 ====================

const currentPageId = ref('')
const children = shallowRef<SparkNode[]>([])
const pageFunctions = shallowRef<Record<string, (...args: unknown[]) => unknown>>({})
let _inFlightPageId: string | null = null
let _loadObjectKeySeq = 0
const _loadObjectKeys = new WeakMap<object, number>()
// ── SparkNodeTree：rule.json 的 SSoT（设计时编辑入口）──
let _nodeTree: SparkNodeTree | null = null
// ── DataSetCrudTool：pagedata.json 的 SSoT（设计时编辑入口）──
let _crudTool: DataSetCrudTool | null = null
const pageContainer = ref<HTMLElement | null>(null)
const currentCapabilityContext = currentInstance
  ? sparkResolveContextOwner(currentInstance)
  : null

// ── CSS 作用域 ──
const { scopedCss, setScopedCss } = useCssScope({ enableScope: props.enableCssScope })
sparkProvide(CSS_SCOPE, { inject(css: string) { setScopedCss(currentPageId.value, css) } } satisfies PageCssScopeCapability)

// ── 页面权限模式 ──
// 与导航节点默认语义保持一致：未提供 permissionMode 时默认 'masked'。
function isNavPermissionMode(value: unknown): value is NavPermissionMode {
  return value === 'none' || value === 'masked' || value === 'invisible'
}

sparkProvide(PAGE_PERMISSION_MODE, isNavPermissionMode(route.meta['permissionMode']) ? route.meta['permissionMode'] : 'masked')

// ── DataSet ──
const pds = usePageDataSet({ enableDataSet: props.enableDataSet })

// ── 脚本沙箱上下文 ──
const pageRoute = createPageRoute(route)
const pageContext: PageContext = buildPageContext({
  getDataSet: () => pds.dataSet,
  getModuleContext: () => moduleContextCapability?.getCurrent() ?? null,
  getComponentRegistry: () => componentRegistry,
  pageRoute,
  pageContainer,
  pageService,
})

// ── 稳定的 actionCtx（闭包引用不变，无需每次 applyNodeProps 重建）──
const actionCtx = {
  getDataSet: () => pds.dataSet,
  getPageService: () => pageService,
  getRouter: () => router,
}
const reportedRuntimeErrorObjects = new WeakSet<object>()

function loadObjectKey(value: object): string {
  const existing = _loadObjectKeys.get(value)
  if (existing !== undefined) return `o:${existing}`
  const next = ++_loadObjectKeySeq
  _loadObjectKeys.set(value, next)
  return `o:${next}`
}

function loadValueKey(value: unknown): string {
  if ((typeof value === 'object' || typeof value === 'function') && value !== null) {
    return loadObjectKey(value)
  }
  return `${typeof value}:${String(value ?? '')}`
}

function resolveLoadKey(pageId: string): string {
  return [
    pageId,
    loadValueKey(props.configLoader ?? null),
    loadValueKey(props.pageConfig ?? null),
    loadValueKey(props.pageConfig?.rule ?? null),
    loadValueKey(props.pageConfig?.data ?? null),
    loadValueKey(props.pageConfig?.script ?? null),
    loadValueKey(props.pageConfig?.css ?? null),
  ].join('|')
}

function shouldSkipImplicitConfigLoad(): boolean {
  if (props.pageConfig || props.pageId !== undefined) return false

  // 非配置页路由不走隐式 PageRenderer，防止 transition out-in 期间误触发。
  // cross-project-ref 的真实渲染器由 CrossProjectRefPage 创建，并显式传入目标 pageId。
  // 但 pageConfig 直传模式不受此限制（如 DevPreviewTab 嵌入预览）
  return (
    route.meta['type'] === 'system-page'
    || route.meta['type'] === 'cross-project-ref'
    || route.matched.length === 0
  )
}

const loadSourceKey = computed(() => {
  if (shouldSkipImplicitConfigLoad()) return ''
  const targetPageId = resolveCurrentPageId(route, props.pageId, props.pageConfig?.pageId)
  return resolveLoadKey(targetPageId)
})

function formatRuntimeError(errorLike: unknown): string {
  if (errorLike instanceof Error) return errorLike.stack ?? errorLike.message
  if (typeof errorLike === 'string') return errorLike
  try {
    return JSON.stringify(errorLike, null, 2)
  } catch {
    return String(errorLike)
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false
  return typeof Reflect.get(value, 'then') === 'function'
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}

function markRuntimeErrorReported(errorLike: unknown): void {
  if (isObjectLike(errorLike)) reportedRuntimeErrorObjects.add(errorLike)
}

function wasRuntimeErrorReported(errorLike: unknown): boolean {
  return isObjectLike(errorLike) && reportedRuntimeErrorObjects.has(errorLike)
}

function reportRuntimeError(phase: PageRuntimeErrorPhase, pageId: string, errorLike: unknown): void {
  markRuntimeErrorReported(errorLike)
  const message = formatRuntimeError(errorLike)
  props.onRuntimeError?.({
    phase,
    message,
    pageId,
    at: new Date().toISOString(),
  })
}

function invalidateCurrentRenderFunctions(): void {
  if (!vueApp) return
  invalidateRenderFunctionsForPage(vueApp, pageFunctions.value)
}

onErrorCaptured((capturedError, _instance, info) => {
  if (wasRuntimeErrorReported(capturedError)) return
  const suffix = info ? `\n\n[vueInfo]\n${info}` : ''
  reportRuntimeError('render', currentPageId.value || 'unknown', `${formatRuntimeError(capturedError)}${suffix}`)
})

// ==================== 脚本编译 ====================

function executeScript(pageId: string, scriptText: string): void {
  if (!scriptText) { pageFunctions.value = {}; return }
  try {
    pageFunctions.value = compileFunctions(scriptText, pageContext)
    logger.info('📜 脚本编译成功', { pageId, functions: Object.keys(pageFunctions.value) })
  } catch (e) {
    logger.error('脚本编译失败', { pageId, error: e })
    reportRuntimeError('script-compile', pageId, e)
    pageFunctions.value = {}
  }
}

function callPageFunction(functionName: string, ...args: unknown[]): unknown {
  const fn = pageFunctions.value[functionName]
  if (typeof fn === 'function') {
    try {
      const result = fn(...args)
      if (isPromiseLike(result)) {
        return Promise.resolve(result)
          .then((value: unknown) => {
            invalidateCurrentRenderFunctions()
            return value
          })
          .catch((e: unknown) => {
            logger.error(`[SparkPageRenderer] 事件函数执行失败: ${functionName}`, { error: e })
            reportRuntimeError('script-function', currentPageId.value || props.pageId || 'unknown', e)
            invalidateCurrentRenderFunctions()
            throw e
          })
      }
      invalidateCurrentRenderFunctions()
      return result
    } catch (e) {
      logger.error(`[SparkPageRenderer] 事件函数执行失败: ${functionName}`, { error: e })
      reportRuntimeError('script-function', currentPageId.value || props.pageId || 'unknown', e)
      invalidateCurrentRenderFunctions()
      throw e
    }
  }
  if (import.meta.env.DEV) {
    logger.warn(`[SparkPageRenderer] 事件函数未定义: ${functionName}`)
  }
  return undefined
}

// ==================== 配置加载流水线 ====================

/** 加载 spark-page props：通过 props.pageConfig 直传四文件或 configLoader 异步获取。 */
async function loadNodeProps(pageId: string): Promise<PageConfig> {
  if (props.pageConfig) return { ...props.pageConfig, pageId: props.pageConfig.pageId ?? pageId }
  if (props.configLoader) {
    const result = await props.configLoader.loadPageConfig(pageId)
    if (!result.success || !result.data) {
      if (result.reason === 'not-found') {
        logger.warn('页面配置不存在', { pageId })
        throw new Error(`页面不存在: ${pageId}`)
      }
      logger.error('配置加载失败', { pageId, error: result.error })
      throw new Error(`配置加载失败: ${result.error ?? '未知错误'}`)
    }
    return result.data
  }
  throw new Error('配置无效: 未提供 configLoader 或 pageConfig')
}

/**
 * spark-page props 应用流水线：将节点 props 应用到渲染状态。
 *
 * 时序：
 *   1. css    → setScopedCss
 *   2. script → compileFunctions → registerRenderComponents
 *   3. data   → DataSet 初始化 → sparkProvide(PAGE_DATASET)
 *   4. rule   → SparkNodeTree → buildPageChildren → children（驱动模板渲染）
 *   ── loading=false → SparkComponentRenderer 挂载 ──
 *   5. nextTick → __init__ + initAutoSelection
 */
function applyNodeProps(pageId: string, nodeProps: PageConfig): void {
  // 1. css → 作用域隔离
  if (nodeProps.css) setScopedCss(pageId, nodeProps.css)

  // 2. script → 沙箱编译 + Render* 组件注册
  executeScript(pageId, nodeProps.script ?? '')
  if (vueApp) registerRenderFunctionsForPage(vueApp, pageFunctions.value)

  // 3. data → DataSet 初始化 + PAGE_DATASET 能力注入
  if (pds.dataSet) pds.clearDataSet()
  pds.initDataSet(nodeProps.data)
  const ds = pds.dataSet
  if (ds) {
    const loaderClient = props.configLoader?.getHttpClient?.()
    if (loaderClient) ds.setSharedHttpClient(loaderClient)
    ds.setAppServices(pageRuntimeServices)
    ds.setPageRoute(pageRoute)
    sparkProvide(PAGE_DATASET, ds)
    _crudTool = DataSetCrudTool.fromDataSet(ds)
  } else {
    _crudTool = null
  }

  // 4. rule → SparkNodeTree → buildPageChildren → children
  _nodeTree = SparkNodeTree.fromPageChildren(nodeProps.rule)
  rebuildChildren()
}

// ==================== 加载入口 ====================

/** 完整加载流程：解析当前 pageId → beforeLoad → loadNodeProps → applyNodeProps → afterLoad。 */
async function loadConfig(options: { force?: boolean } = {}): Promise<void> {
  if (shouldSkipImplicitConfigLoad()) return

  const targetPageId = resolveCurrentPageId(route, props.pageId, props.pageConfig?.pageId)
  if (!options.force && loading.value && _inFlightPageId === targetPageId) return

  _inFlightPageId = targetPageId
  let didApply = false

  try {
    await runLoad(async (isStale) => {
      currentPageId.value = targetPageId
      if (props.beforeLoad) await props.beforeLoad(targetPageId)
      if (isStale()) return
      const nodeProps = await loadNodeProps(targetPageId)
      if (isStale()) return
      applyNodeProps(targetPageId, nodeProps)
      didApply = true
      if (isStale()) return
      if (props.afterLoad) await props.afterLoad(nodeProps)
    }, (error) => {
      reportRuntimeError('load', targetPageId, error)
      props.onError?.(error)
    })
  } finally {
    if (_inFlightPageId === targetPageId) _inFlightPageId = null
  }

  // loading=false 后等待 DOM 渲染完成，再执行 __init__ + initAutoSelection
  // 此时组件已挂载、DataSet 已就绪
  if (!error.value && didApply) {
    await nextTick()
    const init = pageFunctions.value['__init__']
    if (typeof init === 'function') {
      try {
        const initResult = init()
        if (isPromiseLike(initResult)) await initResult
        logger.info('✅ __init__ 执行成功')
      } catch (e) {
        logger.error('__init__ 执行失败', { error: e })
        reportRuntimeError('init', currentPageId.value || targetPageId, e)
      }
    }
    pds.dataSet?.triggerAutoLoad()
    pds.dataSet?.initAutoSelection()
    invalidateCurrentRenderFunctions()
  }
}

/**
 * 从 SparkNodeTree 重建渲染用 children。
 *
 * 设计时编辑 nodeTree 后调用此方法即可刷新 UI，无需重新加载四文件。
 */
function rebuildChildren(): void {
  if (!_nodeTree) {
    children.value = []
    return
  }
  const ruleNodes = getSparkNodeChildren(_nodeTree.root.children)
  children.value = buildPageChildren(ruleNodes, {
    callFunc: callPageFunction,
    actionCtx,
  })
}

function requestLoad(): void {
  void loadConfig().catch(e => logger.error('loadConfig 失败', e))
}

// ==================== 生命周期 ====================

// 页面加载输入 = 页面定位 + 四文件直传输入 + 配置加载器。
// immediate: true 替代 onMounted + watch 二合一——loadConfig 是异步流水线，
// DOM 依赖在 await nextTick() 之后才访问，此时组件已挂载，无需等 onMounted。
// 同 pageId 下的 pageConfig 替换也会触发重载，避免“页面 ID 没变但四文件已更新”时 UI 停留旧状态。
watch(
  loadSourceKey,
  (nextKey) => {
    if (nextKey === '') return
    requestLoad()
  },
  { immediate: true, flush: 'post' },
)

watch(
  pageContainer,
  (nextContainer, prevContainer) => {
    if (prevContainer) {
      sparkUnbindPageRootContext(prevContainer)
    }
    if (nextContainer && currentCapabilityContext) {
      sparkBindPageRootContext(nextContainer, currentCapabilityContext)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (pageContainer.value) {
    sparkUnbindPageRootContext(pageContainer.value)
  }
})

// ==================== Expose ====================

defineExpose({
  reload: () => loadConfig({ force: true }),
  loadConfig,
  pageContext,
  get dataSet(): DataSet | null { return pds.dataSet },
  /** rule.json 的 SSoT 节点树（设计时编辑入口）。页面未加载时为 null。 */
  get nodeTree(): SparkNodeTree | null { return _nodeTree },
  /** 从 nodeTree 重建渲染 children。设计时编辑 nodeTree 后调用以刷新 UI。 */
  rebuildChildren,
  /** pagedata.json 的 SSoT CRUD 工具（设计时编辑入口）。页面未加载时为 null。 */
  get crudTool(): DataSetCrudTool | null { return _crudTool },
})
</script>

<style scoped>
.spark-page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #409eff;
  font-size: 14px;
}

.spark-page-error {
  padding: 20px;
  color: #f56c6c;
}

.spark-page-error h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

.spark-page-error p {
  margin: 0;
  font-size: 14px;
}

.spark-page-container {
  width: 100%;
}
</style>
