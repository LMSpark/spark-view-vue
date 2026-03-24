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

    <!-- 主内容（SPARK 原生渲染，通过 SparkComponentRenderer 递归） -->
    <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
      <slot name="content" :rules="resolvedRules">
        <SparkComponentRenderer
          v-for="(rule, i) in resolvedRules"
          :key="nodeId(rule as SparkNode) ?? `spark-rule-${i}`"
          :config="(rule as SparkNode)"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SparkPageRenderer - SPARK 原生页面渲染器
 *
 * 支持 PageRendererProps 配置，渲染走 SparkComponentRenderer
 * 递归引擎。
 *
 * 功能清单：
 * - 配置加载（pageConfig / configLoader + pageId）
 * - CSS 作用域隔离
 * - 脚本沙箱（compileFunctions + Render* 组件注册）
 * - DataSet 初始化 + PAGE_DATASET 能力注入
 * - 竞态保护（快速切换配置时丢弃旧请求）
 *
 * @component
 * @example
 * ```vue
 * <!-- 全量 PageConfig（rule + css + script + data） -->
 * <SparkPageRenderer :pageConfig="fullConfig" />
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
import type { IModuleContext } from '@spark-view/spark-utils'
import type { PageConfig } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import { nodeId, SPARK_NODE_STRUCT_KEYS, type SparkNode } from '../types'
import { PAGE_DATASET, MODULE_CONTEXT, CSS_SCOPE } from '../capability-keys'
import type { ModuleContextCapability, PageCssScopeCapability } from '../capability-keys'
import { useRendererSetup } from './useRendererSetup'
import { useCssScope } from './useCssScope'
import { usePageDataSet } from './usePageDataSet'
import { compileFunctions } from './page/createSandbox'
import { buildPageService } from './page/buildPageService'
import { buildPageContext } from './page/buildPageContext'
import { buildPageRoute, resolvePageId } from './page/buildPageRoute'
import { registerRenderFunctions } from './page/registerRenderFunctions'
import { normalizeRuleEvents, normalizeOnProps } from './binding/bind-normalize'
import type { ActionExecutionContext } from './actions'
import type { PageContext, PageRendererProps } from './types'
import SparkComponentRenderer from './SparkComponentRenderer.vue'

const logger = Logger('SparkPageRenderer')

// ==================== Props ====================

const props = withDefaults(defineProps<PageRendererProps>(), {
  enableCssScope: true,
  enableDataSet: true,
})

// ==================== 基础设施 ====================

const { router, provideCapability, loading, error, componentRegistry, appServices, runLoad } = useRendererSetup('spark-page-renderer', logger)
const route = useRoute()
const vueApp = getCurrentInstance()?.appContext.app

// PAGE_SERVICE
const pageService = buildPageService(router, {
  messageService: props.messageService,
  confirmService: props.confirmService,
  pageService: props.pageService,
})
provideCapability(PAGE_SERVICE, pageService)

// ==================== 响应式状态 ====================

const currentPageId = ref('')
const resolvedRules = ref<unknown[]>([])
const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})
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
provideCapability(MODULE_CONTEXT, moduleContextCapability)

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
provideCapability(CSS_SCOPE, cssScopeCapability)

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

function bindSparkRuleEvents(
  rules: unknown[],
  pageFunctionsMap: Record<string, (...args: unknown[]) => unknown>
): unknown[] {
  const callFunc = (functionName: string, ...args: unknown[]) => {
    const fn = pageFunctionsMap[functionName]
    if (typeof fn === 'function') return fn(...args)
    if (import.meta.env.DEV) {
      logger.warn(`[SparkPageRenderer] 事件函数未定义: ${functionName}`)
    }
    return undefined
  }

  // ── Action Descriptor 执行上下文（延迟求值） ──
  const actionCtx: ActionExecutionContext = {
    getDataSet: () => pds.dataSet,
    getPageService: () => pageService,
    getRouter: () => router,
    callFunc,
  }

  // ── ID 去重 ──
  // 局部 Set：每次绑定天然全新，SPA 页面切换无需额外清理。
  const usedIds = new Set<string>()

  /** 确保节点拥有全局唯一 ID */
  function ensureUniqueId(type: string, existingId: string | undefined): string {
    const base = existingId ?? type
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let n = 2
    while (usedIds.has(`${base}_${n}`)) n++
    const unique = `${base}_${n}`
    usedIds.add(unique)
    return unique
  }

  // ── 结构键 vs 业务键 ──
  // SPARK_NODE_STRUCT_KEYS（type/props/children/id/dock/order）归框架所有，不收入 props；
  // 其余所有根级字段（visible / disabled / on / dataKey / field …）一律收入 props。

  const bindNode = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(bindNode)
    if (node === null || typeof node !== 'object') return node

    const current = node as Record<string, unknown>
    const cloned: Record<string, unknown> = { ...current }

    // ── 事件绑定：on.* 字符串/action描述符 → 闭包 ──
    if (current['on'] !== null && typeof current['on'] === 'object' && !Array.isArray(current['on'])) {
      cloned['on'] = normalizeRuleEvents(current['on'] as Record<string, unknown>, callFunc, actionCtx)
    }

    // ── props 内事件绑定 + 子结构递归 ──
    if (current['props'] !== null && typeof current['props'] === 'object' && !Array.isArray(current['props'])) {
      const propsObj = { ...(current['props'] as Record<string, unknown>) }
      normalizeOnProps(propsObj, callFunc, actionCtx)
      for (const [propName, propValue] of Object.entries(propsObj)) {
        if (propName.startsWith('on')) continue // 已由 normalizeOnProps 处理
        if (Array.isArray(propValue)) {
          propsObj[propName] = propValue.map(bindNode)
          continue
        }
        if (propValue !== null && typeof propValue === 'object') {
          propsObj[propName] = bindNode(propValue)
        }
      }
      cloned['props'] = propsObj
    }

    // ── children 递归 ──
    if (Array.isArray(current['children'])) {
      cloned['children'] = (current['children'] as unknown[]).map(bindNode)
    }

    // ── 根级字段 → props 规范化 ──
    // 收集非结构键，一次性合并到 props（根级覆盖 props 同名字段）
    let extras: Record<string, unknown> | undefined
    for (const key of Object.keys(cloned)) {
      if (SPARK_NODE_STRUCT_KEYS.has(key)) continue
      if (cloned[key] === undefined) continue
      extras ??= {}
      extras[key] = cloned[key]
    }
    if (extras !== undefined) {
      const cp = cloned['props']
      const existing = (typeof cp === 'object' && cp !== null && !Array.isArray(cp))
        ? cp as Record<string, unknown>
        : {}
      cloned['props'] = { ...existing, ...extras }
    }

    // ── ID 去重（顶层 id 优先，兼容 props.id） ──
    const propsObj = (typeof cloned['props'] === 'object' && cloned['props'] !== null && !Array.isArray(cloned['props']))
      ? cloned['props'] as Record<string, unknown>
      : undefined
    const rawId = typeof cloned['id'] === 'string' ? cloned['id']
      : (typeof propsObj?.['id'] === 'string' ? (propsObj['id'] as string) : undefined)
    if (rawId !== undefined) {
      const nodeType = typeof cloned['type'] === 'string' ? cloned['type'] : 'unknown'
      const finalId = ensureUniqueId(nodeType, rawId)
      cloned['id'] = finalId
      // 同时写入 props 供 v-bind 传递到 DOM
      if (propsObj !== undefined) {
        propsObj['id'] = finalId
      } else {
        cloned['props'] = { id: finalId }
      }
    }

    return cloned
  }

  return rules.map(bindNode)
}

// ==================== 配置加载流水线 ====================

/** 通过 props.pageConfig 直传或 configLoader 异步加载页面配置。 */
async function fetchConfig(pageId: string): Promise<PageConfig> {
  if (props.pageConfig) return props.pageConfig
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
 * 将配置应用到渲染状态。
 *
 * 时序：
 * 1. rules / CSS 写入 → 脚本编译 → Render* 注册
 * 2. DataSet 初始化 → sparkProvide(PAGE_DATASET)
 * 3. loading=false → SparkComponentRenderer 挂载
 * 4. nextTick 后执行 __init__ + initAutoSelection
 */
function applyConfig(pageId: string, config: PageConfig): void {
  if (config.css) setScopedCss(pageId, config.css)
  executeScript(pageId, config.script ?? '')
  registerRenderComponents()

  // DataSet 初始化
  if (pds.dataSet) pds.clearDataSet()
  pds.initDataSet(config.data)
  const ds = pds.dataSet
  if (ds) {
    const loaderClient = props.configLoader?.getHttpClient?.()
    if (isHttpClient(loaderClient)) ds.setSharedHttpClient(loaderClient)
    ds.setAppServices(appServices)
    ds.setPageRoute(pageRoute)
    provideCapability(PAGE_DATASET, ds)
  }

  resolvedRules.value = bindSparkRuleEvents(config.rule as unknown[], pageFunctions.value)
}

// ==================== 加载入口 ====================

/** 完整加载流程：resolvePageId → beforeLoad → fetchConfig → applyConfig → afterLoad。 */
async function loadConfig(): Promise<void> {
  // system-page 路由不走 PageRenderer，防止 transition out-in 期间误触发
  if (route.meta['type'] === 'system-page') return

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
