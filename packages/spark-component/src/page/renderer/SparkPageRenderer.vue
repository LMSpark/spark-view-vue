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
    <div ref="pageContainer" :data-page="currentPageId" :data-node-type="props.type" class="spark-page-container">
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
 * 对齐 h() 三段式模型：
 *   type     = 'spark-page'（根节点类型，本组件自身）
 *   props    = spark-page props（pageId + PageConfig 字段）
 *   children = rule.json 经 buildPageChildren() 归并后的 SparkNode[]
 *
 * spark-page-config 负责四文件契约与加载：
 *   rule / data / script / css 以中立配置形态进入渲染层
 *
 * spark-component 负责运行时物化：
 *   rule.json 是"声明式 children"
 *   加载 → buildPageChildren（根级字段收入 props、事件绑定、ID 去重）
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
  ref, onMounted, onUnmounted, watch, nextTick, getCurrentInstance, shallowRef, defineComponent, markRaw,
} from 'vue'
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router'
import { Logger, PAGE_SERVICE } from '@spark-view/spark-utils'
import type { HttpClient, IModuleContext, IPageServiceCapability } from '@spark-view/spark-utils'
import type { DataSet } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import type { ConfigLoader, IPageRoute, PageConfig } from '@spark-view/spark-page-config'
import { nodeId, type SparkNode } from '../../core/types'
import { PAGE_DATASET, MODULE_CONTEXT, CSS_SCOPE } from '../../core/capabilities'
import { PAGE_PERMISSION_MODE } from '../../permission/page-permission-mode'
import type { ModuleContextCapability, PageCssScopeCapability } from '../../core/capabilities'
import { useRendererSetup } from './useRendererSetup'
import { useCssScope } from './useCssScope'
import { usePageDataSet } from './usePageDataSet'
import { compileFunctions } from '../sandbox/createSandbox'
import { buildPageService } from '../services/buildPageService'
import { buildPageContext } from '../context/buildPageContext'
import { buildPageChildren } from '../binding'
import type { ActionExecutionContext } from '../actions'
import type { PageContext } from '../context/types'
import SparkComponentRenderer from '../../components/SparkComponentRenderer.vue'

const logger = Logger('SparkPageRenderer')
const SPARK_PAGE_TYPE = 'spark-page' as const

type RenderFunction = (props?: Record<string, unknown>) => unknown
const renderFunctionRegistry = new WeakMap<object, Map<string, ReturnType<typeof shallowRef<RenderFunction | null>>>>()

interface MessageService {
  success: (msg: string) => void
  warning: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

interface ConfirmService {
  confirm: (msg: string, title?: string) => Promise<unknown>
  alert: (msg: string, title?: string) => Promise<unknown>
  prompt?: (msg: string, title?: string) => Promise<string | null>
}

function createPageRoute(route: RouteLocationNormalizedLoaded): IPageRoute {
  return {
    get path() { return route.path },
    get fullPath() { return route.fullPath },
    get name() { return route.name ?? null },
    get params() { return route.params as Record<string, string | string[]> },
    get query() { return route.query as Record<string, string | string[] | null> },
    get hash() { return route.hash },
  }
}

function resolveCurrentPageId(
  route: RouteLocationNormalizedLoaded,
  pageId?: string,
  pageConfigPageId?: string,
): string {
  const resolved =
    pageId ??
    pageConfigPageId ??
    (route.meta['pageId'] as string | undefined) ??
    (route.params['id'] as string | undefined) ??
    (route.name as string | undefined)
  if (!resolved) throw new Error('配置无效: 无法确定页面ID')
  return resolved
}

function registerRenderFunctionsForPage(
  app: object,
  pageFunctions: Record<string, (...args: unknown[]) => unknown>,
): void {
  let fnMap = renderFunctionRegistry.get(app)
  if (!fnMap) {
    fnMap = new Map()
    renderFunctionRegistry.set(app, fnMap)
  }

  for (const [name, fn] of Object.entries(pageFunctions)) {
    if (!name.startsWith('Render') || typeof fn !== 'function') continue
    const camelName = name.charAt(0).toLowerCase() + name.slice(1)

    if (fnMap.has(name)) {
      const existingRef = fnMap.get(name)
      if (existingRef) existingRef.value = fn as RenderFunction
      continue
    }

    const fnRef = shallowRef<RenderFunction | null>(fn as RenderFunction)
    fnMap.set(name, fnRef)
    fnMap.set(camelName, fnRef)

    const component = markRaw(defineComponent({
      name,
      setup: (_, { attrs }) => () => fnRef.value?.({ ...attrs }),
    }))
    const vueApp = app as { component: (name: string, component: object) => void }
    vueApp.component(name, component)
    vueApp.component(camelName, component)
  }
}

// ==================== Props ====================

interface SparkPageNodePropsInput {
  /** 直传四文件时可附带 pageId；未提供则回退到 props.pageId / route */
  pageId?: PageConfig['pageId']
  rule: PageConfig['rule']
  data: PageConfig['data']
  script: PageConfig['script']
  css: PageConfig['css']
}

interface Props extends Partial<Pick<SparkNode, 'type'>> {
  /** 配置加载器实例（与 pageId 搭配，异步加载四文件） */
  configLoader?: ConfigLoader
  /** 页面唯一标识符（优先级最高） */
  pageId?: string
  /** 页面配置对象（直接传入四文件，跳过加载） */
  pageConfig?: SparkPageNodePropsInput
  /** 是否启用 CSS 作用域隔离 @default true */
  enableCssScope?: boolean
  /** 是否启用 DataSet 自动初始化 @default true */
  enableDataSet?: boolean
  /** UI 消息服务接口 */
  messageService?: MessageService
  /** UI 确认对话框服务接口 */
  confirmService?: ConfirmService
  /** APP 层注入的页面服务扩展（弹层/文件能力等） */
  pageService?: Partial<IPageServiceCapability>
  /** 模块级上下文（导航系统提供，注入沙箱 $moduleContext） */
  moduleContext?: IModuleContext | null
  /** 页面加载前钩子（loadNodeProps 之前） */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子（applyNodeProps 之后） */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** 错误处理函数 */
  onError?: (error: Error) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: SPARK_PAGE_TYPE,
  enableCssScope: true,
  enableDataSet: true,
})

// ==================== 基础设施 ====================

const { router, sparkProvide, loading, error, componentRegistry, appServices, runLoad } = useRendererSetup('spark-page-renderer', logger)
const route = useRoute()
const vueApp = getCurrentInstance()?.appContext.app

// PAGE_SERVICE
const pageService = buildPageService(router, {
  messageService: props.messageService,
  confirmService: props.confirmService,
  pageService: props.pageService,
})
sparkProvide(PAGE_SERVICE, pageService)

// ==================== 响应式状态 ====================

const currentPageId = ref('')
/** PageConfig.rule 归并后的运行时 children，驱动模板递归渲染 */
const children = ref<SparkNode[]>([])
type PageFunctionsMap = Record<string, (...args: unknown[]) => unknown>
const pageFunctions = ref<PageFunctionsMap>({})
let _inFlightPageId: string | null = null
const pageContainer = ref<HTMLElement | null>(null)
type ModuleContextChangeHandler = (next: IModuleContext | null, prev: IModuleContext | null) => void
const moduleContextListeners = new Set<ModuleContextChangeHandler>()

function cloneModuleContext(value: IModuleContext | null | undefined): IModuleContext | null {
  if (!value) return null
  return {
    nodeId: value.nodeId,
    selected: value.selected,
    items: value.items.map(item => ({ id: item.id, title: item.title })),
  }
}

function moduleContextSignature(value: IModuleContext | null | undefined): string {
  if (!value) return ''
  return JSON.stringify({
    nodeId: value.nodeId,
    selected: value.selected,
    items: value.items.map(item => ({ id: item.id, title: item.title })),
  })
}

function emitModuleContextChange(
  next: IModuleContext | null | undefined,
  prev: IModuleContext | null | undefined,
): void {
  const nextSnapshot = cloneModuleContext(next)
  const prevSnapshot = cloneModuleContext(prev)
  for (const handler of moduleContextListeners) {
    try {
      handler(nextSnapshot, prevSnapshot)
    } catch (error: unknown) {
      logger.warn('模块上下文变化订阅回调执行失败', { error })
    }
  }
}

const moduleContextCapability: ModuleContextCapability = {
  getCurrent() {
    return cloneModuleContext(props.moduleContext ?? null)
  },
  subscribe(handler) {
    moduleContextListeners.add(handler)
    return () => {
      moduleContextListeners.delete(handler)
    }
  },
}
sparkProvide(MODULE_CONTEXT, moduleContextCapability)

function isHttpClient(client: unknown): client is HttpClient {
  if (client === null || client === undefined || typeof client !== 'object') return false
  const candidate = client as Partial<HttpClient>
  return typeof candidate.get === 'function' && typeof candidate.requestFull === 'function'
}

// ── CSS 作用域 ──
const { scopedCss, setScopedCss } = useCssScope({
  enableScope: props.enableCssScope,
})
const cssScopeCapability: PageCssScopeCapability = {
  inject(css: string) { setScopedCss(currentPageId.value, css) },
}
sparkProvide(CSS_SCOPE, cssScopeCapability)

// ── 页面权限模式（后端通过导航配置下发，route meta 传递） ──
const permissionMode = (route.meta['permissionMode'] as NavPermissionMode | undefined) ?? 'masked'
sparkProvide(PAGE_PERMISSION_MODE, permissionMode)

// ── DataSet ──
const pds = usePageDataSet({ enableDataSet: props.enableDataSet })

// ── 脚本沙箱上下文 ──
const pageRoute = createPageRoute(route)
const pageContext: PageContext = buildPageContext({
  getDataSet: () => pds.dataSet,
  getModuleContext: () => cloneModuleContext(props.moduleContext ?? null),
  getComponentRegistry: () => componentRegistry,
  pageRoute,
  pageContainer,
  pageService,
})

// ==================== Render* 组件注册 ====================

function registerRenderComponents(): void {
  if (vueApp) registerRenderFunctionsForPage(vueApp, pageFunctions.value)
}

// ==================== 脚本编译 ====================

function executeScript(pageId: string, scriptText: string): void {
  if (!scriptText) { pageFunctions.value = {}; return }
  try {
    pageFunctions.value = compileFunctions(scriptText, pageContext)
    logger.info('📜 脚本编译成功', { pageId, functions: Object.keys(pageFunctions.value) })
  } catch (e) {
    logger.error('脚本编译失败', { pageId, error: e })
    pageFunctions.value = {}
  }
}

function callPageFunction(functionName: string, ...args: unknown[]): unknown {
  const fn = pageFunctions.value[functionName]
  if (typeof fn === 'function') return fn(...args)
  if (import.meta.env.DEV) {
    logger.warn(`[SparkPageRenderer] 事件函数未定义: ${functionName}`)
  }
  return undefined
}

function createPageActionContext(): ActionExecutionContext {
  return {
    getDataSet: () => pds.dataSet,
    getPageService: () => pageService,
    getRouter: () => router,
    callFunc: callPageFunction,
  }
}

// ==================== 配置加载流水线 ====================

function resolveNodeProps(pageId: string, config: SparkPageNodePropsInput): PageConfig {
  return {
    pageId: config.pageId ?? pageId,
    rule: config.rule,
    data: config.data,
    script: config.script,
    css: config.css,
  }
}

/** 加载 spark-page props：通过 props.pageConfig 直传四文件或 configLoader 异步获取。 */
async function loadNodeProps(pageId: string): Promise<PageConfig> {
  if (props.pageConfig) return resolveNodeProps(pageId, props.pageConfig)
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
 *   4. rule   → buildPageChildren → children（驱动模板渲染）
 *   ── loading=false → SparkComponentRenderer 挂载 ──
 *   5. nextTick → __init__ + initAutoSelection
 */
function applyCssProp(pageId: string, css: PageConfig['css']): void {
  if (css) setScopedCss(pageId, css)
}

function applyScriptProp(pageId: string, script: PageConfig['script']): void {
  executeScript(pageId, script ?? '')
  registerRenderComponents()
}

function applyDataProp(data: PageConfig['data']): void {
  if (pds.dataSet) pds.clearDataSet()
  pds.initDataSet(data)
  const ds = pds.dataSet
  if (!ds) return

  const loaderClient = props.configLoader?.getHttpClient?.()
  if (isHttpClient(loaderClient)) ds.setSharedHttpClient(loaderClient)
  ds.setAppServices(appServices)
  ds.setPageRoute(pageRoute)
  sparkProvide(PAGE_DATASET, ds)
}

function applyChildrenProp(rule: PageConfig['rule']): void {
  children.value = buildPageChildren(rule, {
    callFunc: callPageFunction,
    actionCtx: createPageActionContext(),
  })
}

function applyNodeProps(pageId: string, nodeProps: PageConfig): void {
  // 1. css → 作用域隔离
  applyCssProp(pageId, nodeProps.css)

  // 2. script → 沙箱编译 + Render* 组件注册
  applyScriptProp(pageId, nodeProps.script)

  // 3. data → DataSet 初始化 + PAGE_DATASET 能力注入
  applyDataProp(nodeProps.data)

  // 4. rule → buildPageChildren → children
  applyChildrenProp(nodeProps.rule)
}

// ==================== 加载入口 ====================

/** 完整加载流程：解析当前 pageId → beforeLoad → loadNodeProps → applyNodeProps → afterLoad。 */
async function loadConfig(): Promise<void> {
  // system-page 路由不走 PageRenderer，防止 transition out-in 期间误触发
  if (route.meta['type'] === 'system-page') return
  if (route.matched.length === 0) return

  const targetPageId = resolveCurrentPageId(route, props.pageId, props.pageConfig?.pageId)
  if (loading.value && _inFlightPageId === targetPageId) return
  _inFlightPageId = targetPageId

  await runLoad(async (isStale) => {
    currentPageId.value = targetPageId
    if (props.beforeLoad) await props.beforeLoad(targetPageId)
    if (isStale()) return
    const nodeProps = await loadNodeProps(targetPageId)
    if (isStale()) return
    applyNodeProps(targetPageId, nodeProps)
    if (isStale()) return
    if (props.afterLoad) await props.afterLoad(nodeProps)
  }, props.onError)

  _inFlightPageId = null

  // loading=false 后等待 DOM 渲染完成，再执行 __init__ + initAutoSelection
  // 此时组件已挂载、DataSet 已就绪
  if (!error.value) {
    await nextTick()
    const init = pageFunctions.value['__init__']
    if (typeof init === 'function') {
      try {
        init()
        logger.info('✅ __init__ 执行成功')
      } catch (e) {
        logger.error('__init__ 执行失败', { error: e })
      }
    }
    pds.dataSet?.triggerAutoLoad()
    pds.dataSet?.initAutoSelection()
  }
}

async function reload(): Promise<void> {
  await loadConfig()
}

function requestLoad(): void {
  void loadConfig().catch(e => logger.error('loadConfig 失败', e))
}

// ==================== 生命周期 ====================

onMounted(() => {
  requestLoad()
})

onUnmounted(() => {
  moduleContextListeners.clear()
})

// 用 signature 字符串作为 watch source，Vue 仅追踪 getter 中访问的属性。
// 相比 deep:true（独立递归遍历 + callback 内 JSON.stringify），开销减半。
let _prevModuleContext = props.moduleContext
watch(
  () => moduleContextSignature(props.moduleContext),
  () => {
    const next = props.moduleContext
    const prev = _prevModuleContext
    _prevModuleContext = next
    emitModuleContextChange(next, prev)
  },
)

// 页面加载输入 = 页面定位 + 四文件直传输入 + 配置加载器。
// 这样同 pageId 下的 pageConfig 替换也会触发重载，避免“页面 ID 没变但四文件已更新”时 UI 停留旧状态。
watch(
  [
    () => props.pageId,
    () => props.pageConfig?.pageId,
    () => route.meta['pageId'],
    () => route.params['id'],
    () => route.name,
    () => props.pageConfig?.rule,
    () => props.pageConfig?.data,
    () => props.pageConfig?.script,
    () => props.pageConfig?.css,
    () => props.configLoader,
  ],
  () => {
    requestLoad()
  },
)

// ==================== Expose ====================

defineExpose({
  reload,
  loadConfig,
  pageContext,
  get dataSet(): DataSet | null { return pds.dataSet },
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
