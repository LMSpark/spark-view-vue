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

    <!-- 页面内容树（rule.json → buildPageChildren → pageChildren，递归渲染） -->
    <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
      <slot name="content" :children="pageChildren" :rules="pageChildren">
        <SparkComponentRenderer
          v-for="(child, i) in pageChildren"
          :key="nodeId(child) ?? `spark-child-${i}`"
          :config="child"
        />
      </slot>
    </div>
  </div>
</template>

<script lang="ts">
import type { ConfigLoader, PageConfig, PageConfigFiles } from '@spark-view/spark-page-config'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'

export interface PageRendererConfigInput extends PageConfigFiles {
  /** 直传四文件时可附带 pageId；未提供则回退到 props.pageId / route */
  pageId?: string
}

/**
 * 页面渲染器 Props — 对齐 h(type, props, children)
 *
 * SparkPageRenderer 的输入本质是 spark-page-config 定义的四文件 bundle + 运行时选项：
 *
 * | 四文件         | PageConfig 字段 | 渲染器视角                              |
 * |----------------|----------------|-----------------------------------------|
 * | rule.json      | config.rule    | → buildPageChildren → **children**      |
 * | pagedata.json  | config.data    | → DataSet → sparkProvide(PAGE_DATASET)  |
 * | script.js      | config.script  | → compileFunctions → Render* 注册       |
 * | style.css      | config.css     | → setScopedCss（作用域隔离注入）         |
 *
 * 四文件来源二选一：pageConfig（直传四文件）或 configLoader + pageId（异步加载）。
 */
export interface PageRendererProps {
  // ── 四文件来源（二选一） ──────────────────────────────────────────

  /** 配置加载器实例（与 pageId 搭配，异步加载四文件） */
  configLoader?: ConfigLoader
  /** 页面唯一标识符（优先级最高） */
  pageId?: string
  /** 页面配置对象（直接传入四文件，跳过加载） */
  pageConfig?: PageRendererConfigInput

  // ── 功能开关 ─────────────────────────────────────────────────────

  /** 是否启用 CSS 作用域隔离 @default true */
  enableCssScope?: boolean
  /** 是否启用 DataSet 自动初始化 @default true */
  enableDataSet?: boolean

  // ── UI 服务注入（框架无关，可替换 ElementPlus 默认实现） ─────────

  /** UI 消息服务接口 */
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
  /** UI 确认对话框服务接口 */
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
    prompt?: (msg: string, title?: string) => Promise<string | null>
  }
  /** APP 层注入的页面服务扩展（弹层/文件能力等） */
  pageService?: Partial<IPageServiceCapability>

  // ── 外部上下文 ───────────────────────────────────────────────────

  /** 模块级上下文（导航系统提供，注入沙箱 $moduleContext） */
  moduleContext?: IModuleContext | null

  // ── 生命周期钩子 ─────────────────────────────────────────────────

  /** 页面加载前钩子（fetchConfig 之前） */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子（applyConfig 之后） */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** 错误处理函数 */
  onError?: (error: Error) => void
}
</script>

<script setup lang="ts">
/**
 * SparkPageRenderer — 页面级 h(type, props, children) 渲染器
 *
 * 对齐 h() 三段式模型：
 *   type     = 'spark-page'（隐式，本组件自身）
 *   props    = PageConfigFiles 四文件（rule · data · script · css）+ 运行时选项
 *   children = rule.json 经 buildPageChildren() 归并后的 SparkNode[]
 *
 * spark-page-config 负责四文件契约与加载：
 *   rule / data / script / css 以中立配置形态进入渲染层
 *
 * spark-component 负责运行时物化：
 *   rule.json 是"声明式 children"
 *   加载 → buildPageChildren（根级字段收入 props、事件绑定、ID 去重）
 *   → pageChildren（SparkNode[]）→ SparkComponentRenderer 递归渲染
 *
 * 四文件加载流水线（applyConfig）：
 *   1. css    → setScopedCss（作用域隔离注入）
 *   2. script → compileFunctions → registerRenderComponents
 *   3. data   → DataSet 初始化 → sparkProvide(PAGE_DATASET)
 *   4. rule   → buildPageChildren → pageChildren（驱动模板渲染）
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
  ref, onMounted, onUnmounted, watch, nextTick, getCurrentInstance,
} from 'vue'
import { useRoute } from 'vue-router'
import { Logger, PAGE_SERVICE } from '@spark-view/spark-utils'
import type { HttpClient } from '@spark-view/spark-utils'
import type { DataSet } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'
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
import { buildPageRoute, resolvePageId } from '../context/buildPageRoute'
import { registerRenderFunctions } from '../services/registerRenderFunctions'
import { buildPageChildren } from '../binding'
import type { ActionExecutionContext } from '../actions'
import type { PageContext } from '../context/types'
import SparkComponentRenderer from '../../components/SparkComponentRenderer.vue'

const logger = Logger('SparkPageRenderer')

// ==================== Props ====================

const props = withDefaults(defineProps<PageRendererProps>(), {
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
/** PageConfig.rule 归并后的 SparkPageRenderer 实际 children，驱动模板递归渲染 */
const pageChildren = ref<SparkNode[]>([])
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
const pageRoute = buildPageRoute(route)
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
  if (vueApp) registerRenderFunctions(vueApp, pageFunctions.value)
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

function toResolvedPageConfig(pageId: string, config: PageRendererConfigInput): PageConfig {
  return {
    pageId: config.pageId ?? pageId,
    rule: config.rule,
    data: config.data,
    script: config.script,
    css: config.css,
  }
}

/** 通过 props.pageConfig 直传四文件或 configLoader 异步加载页面配置。 */
async function fetchConfig(pageId: string): Promise<PageConfig> {
  if (props.pageConfig) return toResolvedPageConfig(pageId, props.pageConfig)
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
 * 四文件加载流水线：将 PageConfigFiles 应用到渲染状态。
 *
 * 时序：
 *   1. css    → setScopedCss
 *   2. script → compileFunctions → registerRenderComponents
 *   3. data   → DataSet 初始化 → sparkProvide(PAGE_DATASET)
 *   4. rule   → buildPageChildren → pageChildren（驱动模板渲染）
 *   ── loading=false → SparkComponentRenderer 挂载 ──
 *   5. nextTick → __init__ + initAutoSelection
 */
function applyPageCss(pageId: string, css: PageConfigFiles['css']): void {
  if (css) setScopedCss(pageId, css)
}

function applyPageScript(pageId: string, script: PageConfigFiles['script']): void {
  executeScript(pageId, script ?? '')
  registerRenderComponents()
}

function applyPageData(data: PageConfigFiles['data']): void {
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

function applyPageChildren(rule: PageConfigFiles['rule']): void {
  pageChildren.value = buildPageChildren(rule, {
    callFunc: callPageFunction,
    actionCtx: createPageActionContext(),
  })
}

function applyConfig(pageId: string, config: PageConfigFiles): void {
  // 1. css → 作用域隔离
  applyPageCss(pageId, config.css)

  // 2. script → 沙箱编译 + Render* 组件注册
  applyPageScript(pageId, config.script)

  // 3. data → DataSet 初始化 + PAGE_DATASET 能力注入
  applyPageData(config.data)

  // 4. rule → buildPageChildren → pageChildren
  applyPageChildren(config.rule)
}

// ==================== 加载入口 ====================

/** 完整加载流程：resolvePageId → beforeLoad → fetchConfig → applyConfig → afterLoad。 */
async function loadConfig(): Promise<void> {
  // system-page 路由不走 PageRenderer，防止 transition out-in 期间误触发
  if (route.meta['type'] === 'system-page') return
  if (route.matched.length === 0) return

  const targetPageId = resolvePageId(route, props.pageId, props.pageConfig?.pageId)
  if (loading.value && _inFlightPageId === targetPageId) return
  _inFlightPageId = targetPageId

  await runLoad(async (isStale) => {
    currentPageId.value = targetPageId
    if (props.beforeLoad) await props.beforeLoad(targetPageId)
    if (isStale()) return
    const config = await fetchConfig(targetPageId)
    if (isStale()) return
    applyConfig(targetPageId, config)
    if (isStale()) return
    if (props.afterLoad) await props.afterLoad(config)
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

// ==================== 生命周期 ====================

onMounted(() => {
  loadConfig().catch(e => logger.error('loadConfig 失败', e))
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

watch(
  () => props.pageId ?? route.meta['pageId'] ?? route.params['id'] ?? route.name,
  (newId, oldId) => { if (newId !== oldId) loadConfig().catch(e => logger.error('loadConfig 失败', e)) },
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
