<template>
  <div class="spark-page-renderer">
    <!-- 加载状态 -->
    <div v-if="loading" class="spark-page-renderer__loading">
      <slot name="loading">
        <div class="loading-content">
          <span class="loading-icon">⏳</span>
          <span>加载配置中...</span>
        </div>
      </slot>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="spark-page-renderer__error">
      <slot name="error" :error="error">
        <div class="error-content">
          <h3>❌ 配置加载失败</h3>
          <p>{{ error }}</p>
          <button @click="reload" class="retry-button">重试</button>
        </div>
      </slot>
    </div>

    <!-- 渲染结果 -->
    <div v-else class="spark-page-renderer__content">
      <!-- 动态注入页面样式（自动添加作用域） -->
      <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>

      <!-- 配置查看器（调试用） -->
      <div v-if="showConfigViewer && resolvedRules.length > 0" class="config-viewer">
        <el-collapse>
          <el-collapse-item title="📄 查看 JSON 配置" name="config">
            <pre class="config-json">{{ JSON.stringify(resolvedRules, null, 2) }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- 主内容（SPARK 原生渲染，通过 SparkComponentRenderer 递归） -->
      <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
        <slot name="content" :rules="resolvedRules">
          <!-- 单规则 + 自定义组件：直接渲染 -->
          <component
            v-if="resolvedRules.length === 1 && component"
            :is="component"
            v-bind="(resolvedRules[0] as ComponentConfig)?.props ?? {}"
            :config="resolvedRules[0]"
          />
          <!-- 多规则 / 走注册表：SparkComponentRenderer 递归渲染 -->
          <template v-else>
            <SparkComponentRenderer
              v-for="(rule, i) in resolvedRules"
              :key="(rule as ComponentConfig).id ?? `spark-rule-${i}`"
              :config="(rule as ComponentConfig)"
            />
          </template>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SparkPageRenderer - SPARK 原生页面渲染器（全功能版）
 *
 * 与 FCPageRenderer 同构，支持完整 PageConfig（rule + css + script + data），
 * 但渲染走 SparkComponentRenderer 递归引擎，不依赖 form-create。
 *
 * 功能清单：
 * - 配置加载（configUrl / config / pageConfig / configLoader + pageId）
 * - CSS 作用域隔离
 * - 脚本沙箱（compileFunctions + Render* 组件注册）
 * - DataSet 初始化 + PAGE_DATASET 能力注入
 * - 竞态保护（快速切换配置时丢弃旧请求）
 *
 * @component
 * @example
 * ```vue
 * <!-- 简单用法：远程加载单个 ComponentConfig -->
 * <SparkPageRenderer configUrl="/user-grid-demo.json" />
 *
 * <!-- 全量 PageConfig（rule + css + script + data） -->
 * <SparkPageRenderer :pageConfig="fullConfig" />
 *
 * <!-- configLoader + pageId（与 FCPageRenderer 同构） -->
 * <SparkPageRenderer :configLoader="loader" pageId="user-list" />
 *
 * <!-- 直接传入组件 -->
 * <SparkPageRenderer :config="{ type: 'my-grid' }" :component="UserGrid" />
 * ```
 */
import {
  ref, onMounted, watch, nextTick, getCurrentInstance,
  shallowRef, defineComponent, markRaw,
  type Component, type App, type ShallowRef,
} from 'vue'
import { useRoute } from 'vue-router'
import { Logger, PAGE_SERVICE } from '@spark-view/spark-utils'
import type { ConfigLoader, PageConfig } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import type { ComponentConfig } from '../../core/types'
import { PAGE_DATASET } from '../../capability-keys'
import { useRendererSetup } from '../composables/useRendererSetup'
import { useCssScope } from '../composables/useCssScope'
import { usePageDataSet } from '../composables/usePageDataSet'
import { compileFunctions } from '../utils/createSandbox'
import { buildPageService } from '../utils/buildPageService'
import { buildPageContext } from '../utils/buildPageContext'
import type { PageContext, FormCreateAPI } from '../types'
import SparkComponentRenderer from './SparkComponentRenderer.vue'

const logger = Logger('SparkPageRenderer')

// ─── 模块级 Render* 组件注册表 ────────────────────────────────────────────
const _renderFnRegistry = new WeakMap<App, Map<string, ShallowRef<(() => unknown) | null>>>()

// ==================== Props ====================

interface SparkPageRendererProps {
  // ── 简单模式（单个 ComponentConfig） ──
  /** 配置文件 URL（远程加载） */
  configUrl?: string
  /** 单个组件配置（直接传入） */
  config?: ComponentConfig
  /** 渲染组件（跳过注册表，直接 <component :is> 渲染） */
  component?: Component

  // ── 全量 PageConfig 模式（与 FCPageRenderer 同构） ──
  /** 配置加载器实例 */
  configLoader?: ConfigLoader
  /** 页面唯一标识符 */
  pageId?: string
  /** 完整页面配置对象（直接传入，跳过加载） */
  pageConfig?: PageConfig

  // ── 通用选项 ──
  /** 是否显示配置查看器（调试用） */
  showConfigViewer?: boolean
  /** 是否启用 CSS 作用域隔离 */
  enableCssScope?: boolean
  /** 是否启用 DataSet */
  enableDataSet?: boolean
  /** 错误处理回调 */
  onError?: (error: Error) => void
  /** 页面加载前钩子 */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子 */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** UI 消息服务注入（测试用） */
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
  /** UI 确认框服务注入（测试用） */
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
  }
}

const props = withDefaults(defineProps<SparkPageRendererProps>(), {
  showConfigViewer: false,
  enableCssScope: true,
  enableDataSet: true,
})

// ==================== 基础设施 ====================

const { router, provideCapability, loading, error, runLoad } = useRendererSetup('spark-page-renderer', logger)
const route = useRoute()
const vueApp = getCurrentInstance()?.appContext.app

// PAGE_SERVICE
const pageService = buildPageService(router, {
  messageService: props.messageService,
  confirmService: props.confirmService,
})
provideCapability(PAGE_SERVICE, pageService)

// ==================== 响应式状态 ====================

const currentPageId = ref('')
const resolvedRules = ref<unknown[]>([])
const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})
/** 虚拟 formApi — SPARK 原生渲染无 form-create，脚本中 $api 为 null */
const formApi = ref<FormCreateAPI | null>(null)
const pageContainer = ref<HTMLElement | null>(null)

// ── CSS 作用域 ──
const { scopedCss, setScopedCss } = useCssScope({
  pageId: currentPageId.value,
  enableScope: props.enableCssScope,
})

// ── DataSet ──
const pds = usePageDataSet({ enableDataSet: props.enableDataSet })

// ── 脚本沙箱上下文 ──
const pageContext: PageContext = buildPageContext({
  formApi,
  getDataSet: () => pds.dataSet,
  pageRoute: {
    get path()     { return route.path },
    get fullPath() { return route.fullPath },
    get name()     { return route.name ?? null },
    get params()   { return route.params as Record<string, string | string[]> },
    get query()    { return route.query as Record<string, string | string[] | null> },
    get hash()     { return route.hash },
  },
  pageContainer,
  rebindRules: () => { /* SPARK 原生渲染无 form-create rebind */ },
  pageService,
})

// ==================== 判断配置模式 ====================

/** 是否为全量 PageConfig 模式（有 configLoader / pageConfig / pageId） */
function isPageConfigMode(): boolean {
  return props.pageConfig !== undefined || props.configLoader !== undefined || props.pageId !== undefined
}

// ==================== Render* 组件注册 ====================

function registerRenderComponents(): void {
  if (!vueApp) return
  let fnMap = _renderFnRegistry.get(vueApp)
  if (!fnMap) {
    fnMap = new Map<string, ShallowRef<(() => unknown) | null>>()
    _renderFnRegistry.set(vueApp, fnMap)
  }
  for (const [name, fn] of Object.entries(pageFunctions.value)) {
    if (!name.startsWith('Render') || typeof fn !== 'function') continue
    const camelName = name.charAt(0).toLowerCase() + name.slice(1)
    if (fnMap.has(name)) {
      const existingRef = fnMap.get(name)
      if (existingRef) existingRef.value = fn as () => unknown
    } else {
      const fnRef = shallowRef<(() => unknown) | null>(fn as () => unknown)
      fnMap.set(name, fnRef)
      fnMap.set(camelName, fnRef)
      const comp = markRaw(defineComponent({
        name,
        setup: () => () => fnRef.value?.(),
      }))
      vueApp.component(name, comp)
      vueApp.component(camelName, comp)
    }
  }
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

// ==================== PageConfig 模式加载 ====================

function resolvePageId(): string {
  const pid =
    props.pageId ??
    props.pageConfig?.pageId ??
    (route.meta['pageId'] as string | undefined) ??
    (route.params['id'] as string | undefined) ??
    (route.name as string | undefined)
  if (!pid) throw new Error('配置无效: 无法确定页面ID')
  return pid
}

async function fetchPageConfig(pageId: string): Promise<PageConfig> {
  if (props.pageConfig) return props.pageConfig
  if (props.configLoader) {
    const result = await props.configLoader.loadPageConfig(pageId)
    if (!result.success || !result.data) {
      throw new Error(`配置加载失败: ${result.error ?? '未知错误'}`)
    }
    return result.data
  }
  throw new Error('配置无效: 未提供 configLoader 或 pageConfig')
}

async function applyPageConfig(pageId: string, config: PageConfig): Promise<void> {
  resolvedRules.value = config.rule as unknown[]
  if (config.css) setScopedCss(config.css)

  executeScript(pageId, config.script ?? '')
  registerRenderComponents()

  // DataSet 初始化
  if (pds.dataSet) pds.clearDataSet()
  pds.initDataSet(config.data)
  const ds = pds.dataSet
  if (ds) provideCapability(PAGE_DATASET, ds)

  await nextTick()

  // __init__ 执行（DataSet 已就绪）
  const init = pageFunctions.value['__init__']
  if (typeof init === 'function') {
    try {
      init()
      logger.info('✅ __init__ 执行成功')
    } catch (e) {
      logger.error('__init__ 执行失败', { error: e })
    }
  }
  // 触发初始选中
  pds.dataSet?.initAutoSelection()
}

// ==================== 简单模式加载（单个 ComponentConfig / configUrl） ====================

async function loadSimpleConfig(): Promise<void> {
  if (props.config) {
    resolvedRules.value = [props.config]
  } else if (props.configUrl) {
    logger.info('加载配置:', props.configUrl)
    const response = await fetch(props.configUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = (await response.json()) as Record<string, unknown>
    // 远程 JSON 可能是 PageConfig（有 rule 数组）或单个 ComponentConfig
    if (Array.isArray(data['rule'])) {
      // 完整 PageConfig 结构
      const pc = data as unknown as PageConfig
      const pageId = pc.pageId ?? 'remote'
      currentPageId.value = pageId
      await applyPageConfig(pageId, pc)
      return
    }
    resolvedRules.value = [data as unknown as ComponentConfig]
  } else {
    throw new Error('必须提供 configUrl、config、pageConfig 或 configLoader')
  }
}

// ==================== 统一加载入口 ====================

async function loadConfig(): Promise<void> {
  await runLoad(async (isStale) => {
    if (isPageConfigMode()) {
      const pageId = resolvePageId()
      currentPageId.value = pageId
      if (props.beforeLoad) await props.beforeLoad(pageId)
      if (isStale()) return
      const config = await fetchPageConfig(pageId)
      if (isStale()) return
      await applyPageConfig(pageId, config)
      if (isStale()) return
      if (props.afterLoad) await props.afterLoad(config)
    } else {
      await loadSimpleConfig()
    }
  }, props.onError)
}

async function reload(): Promise<void> {
  await loadConfig()
}

// ==================== 生命周期 ====================

onMounted(() => {
  loadConfig().catch(e => logger.error('loadConfig 失败', e))
})

// PageConfig 模式：监听 pageId 变化
watch(
  () => props.pageId ?? route.meta['pageId'] ?? route.params['id'] ?? route.name,
  (newId, oldId) => {
    if (isPageConfigMode() && newId !== oldId) {
      loadConfig().catch(e => logger.error('loadConfig 失败', e))
    }
  },
)

// 简单模式：监听 configUrl / config 变化
watch(
  () => [props.configUrl, props.config] as const,
  () => {
    if (!isPageConfigMode()) {
      loadConfig().catch(e => logger.error('loadConfig 失败', e))
    }
  },
  { deep: true },
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
.spark-page-renderer {
  width: 100%;
  min-height: 200px;
  background: white;
  border-radius: 8px;
  padding: 20px;
}

/* 加载状态 */
.spark-page-renderer__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #409eff;
  font-size: 14px;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.loading-icon {
  font-size: 32px;
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 错误状态 */
.spark-page-renderer__error {
  padding: 20px;
  color: #f56c6c;
}

.error-content h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

.error-content p {
  margin: 0 0 15px;
  font-size: 14px;
}

.retry-button {
  padding: 8px 16px;
  background: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.retry-button:hover {
  background: #66b1ff;
}

/* 配置查看器 */
.config-viewer {
  margin-bottom: 20px;
}

.config-json {
  background: #f5f5f5;
  padding: 10px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  border-radius: 4px;
  margin: 0;
}

/* 渲染内容 */
.spark-page-renderer__content {
  width: 100%;
}

.no-component-warning {
  padding: 20px;
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  text-align: center;
}
</style>
