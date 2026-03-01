/**
 * usePageRenderer — 页面渲染编排 Composable
 *
 * 负责 FCPageRenderer 的完整生命周期：
 *   配置加载 → DataSet 初始化 → CSS 作用域 → 脚本沙箱 → 规则绑定
 *
 * FCPageRenderer.vue 只做模板渲染，所有状态与逻辑均在此处。
 *
 * @example
 * ```vue
 * <script setup>
 * const props       = defineProps<PageRendererOptions>()
 * const pageContainer = ref<HTMLElement | null>(null)
 * const vueApp      = getCurrentInstance()?.appContext.app
 * const { loading, boundRules, formApi, formCreateOptions, ... }
 *   = usePageRenderer(props, { pageContainer, vueApp })
 * </script>
 * ```
 */

import {
  ref, reactive, shallowRef, onMounted, watch, nextTick,
  h, inject, defineComponent, markRaw,
  type App, type Ref, type Component, type ShallowRef,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Logger, APP_SERVICES, PAGE_SERVICE, type IPageServiceCapability } from '@spark-view/spark-utils'
import type { DataSet } from '@spark-view/spark-data'
import { SparkData, PAGE_DATASET } from '@spark-view/spark-data'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSparkComponent } from '../../composables/useSparkComponent'
import { SPARK_REGISTRY_KEY } from '../../core/types.js'
import { usePageDataSet } from './usePageDataSet'
import type { PageRendererOptions, PageContext, Rule, FormCreateAPI, PageConfig } from '../types'
import { useCssScope } from './useCssScope'
import { useRuleBinding } from './useRuleBinding'
import { compileFunctions } from '../utils/createSandbox'
import { buildAppServices } from '../utils/provideAppServices'

const pageLogger = Logger('PageRenderer')

// ─── 模块级 Render* 组件注册表 ────────────────────────────────────────────────
// 每个 Vue App 实例维护一张 name → ShallowRef<renderFn> 的映射。
// 首次遇到某名称时创建组件并调用 app.component()（只注册一次，消除重复注册 warn）。
// 页面重新加载时只更新 ref.value，shallowRef 的响应性会自动触发组件重渲染。
const _renderFnRegistry = new WeakMap<App, Map<string, ShallowRef<(() => unknown) | null>>>()

// ─── 模块级常量 ──────────────────────────────────────────────────────────────
// 与实例无关的 form-create 默认配置，提升到模块级避免每次调用重建。
// e-columns / e-column 系列渲染为 null，防止 EJ2 自定义元素产生 Vue warn。

const DEFAULT_FORM_CREATE_OPTIONS = {
  form: false,
  submitBtn: false,
  resetBtn: false,
  injectEvent: true,
  global: {
    'e-columns': { render: () => null },
    'eColumns':  { render: () => null },
    'e-column':  { render: () => null },
    'eColumn':   { render: () => null },
  } as Record<string, Component>,
}

// ─── 公共接口 ─────────────────────────────────────────────────────────────────

/** FCPageRenderer.vue 传入的模板 ref 及框架引用 */
export interface UsePageRendererRefs {
  /** 页面容器 DOM ref */
  pageContainer: Ref<HTMLElement | null>
  /**
   * Vue App 实例。
   * 必须由 SFC 在同步 setup() 中捕获后传入，用于将脚本中定义的 `Render*` 函数
   * 注册为全局组件（`app.component()`）。
   * 不由 composable 内部获取的原因：loadPageConfig 是 async 函数，
   * await 之后 getCurrentInstance() 始终返回 null。
   */
  vueApp?: App
}

/** usePageRenderer 的返回值，供模板绑定与外部调用 */
export interface UsePageRendererReturn {
  // ── 模板绑定 ──
  loading: Ref<boolean>
  error: Ref<string>
  currentPageId: Ref<string>
  scopedCss: Ref<string>
  boundRules: Ref<unknown[]>
  pageData: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formApi: Ref<any>
  formCreateOptions: Ref<Record<string, unknown>>
  // ── 外部调用 ──
  loadPageConfig: () => Promise<void>
  rebindRules: () => void
  pageContext: PageContext
  dataSet: DataSet | null
}

// ─── Composable 实现 ──────────────────────────────────────────────────────────

export function usePageRenderer(
  props: Readonly<PageRendererOptions>,
  refs: UsePageRendererRefs,
): UsePageRendererReturn {
  const { pageContainer, vueApp } = refs

  // ── SPARK 能力上下文 ────────────────────────────────────────────────────────
  // APP_SERVICES / PAGE_SERVICE 注入到组件树，供子组件通过 consume() 取用。

  const router = useRouter()
  const route  = useRoute()
  const { provide: provideCapability } = useSparkComponent({ type: 'page-renderer', id: 'page-renderer-root' })

  // 组件注册表：供 useRuleBinding 查询 dataKey 行为元数据
  const registry = inject(SPARK_REGISTRY_KEY, undefined)

  provideCapability(APP_SERVICES, buildAppServices(router, pageLogger))

  // PAGE_SERVICE：优先使用 props 注入的 UI 服务（测试/Storybook），回退到 element-plus
  const pageService: IPageServiceCapability = {
    showMessage: (message, type = 'info') => {
      const fn = props.messageService?.[type]
      if (typeof fn === 'function') { fn(message); return }
      ElMessage({ message, type })
    },
    showConfirm: async (message, title) => {
      if (props.confirmService) {
        await props.confirmService.confirm(message, title)
        return true
      }
      try { await ElMessageBox.confirm(message, title ?? '确认'); return true }
      catch { return false }
    },
    showLoading: (_show) => { /* 待实现：接入全局加载遮罩服务 */ },
    navigate: (path, params) => {
      void router.push(params ? { path, query: params as Record<string, string> } : path)
    },
  }
  provideCapability(PAGE_SERVICE, pageService)

  // ── 响应式状态 ───────────────────────────────────────────────────────────────

  const loading       = ref(true)
  const error         = ref<string>('')
  const currentPageId = ref<string>('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formApi       = ref<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalRules = ref<any[]>([])
  const pageData      = reactive<Record<string, unknown>>({})
  /** 脚本沙箱编译后的函数表；`__init__` 由 form-create mounted 钩子调用 */
  const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})

  // ── form-create 配置 ─────────────────────────────────────────────────────────
  // mounted 钩子是执行 __init__ 的时机：此时 $api 已就绪，DataSet 也已初始化。
  // ⚠️ formData 双向绑定暂时禁用，会导致 DataSet 事件死循环。

  const formCreateOptions = ref({
    ...DEFAULT_FORM_CREATE_OPTIONS,
    ...props.formCreateOptions,
    mounted: () => {
      const init = pageFunctions.value['__init__']
      if (typeof init === 'function') {
        try {
          init()
          pageLogger.info('✅ __init__ 执行成功')
        } catch (e) {
          pageLogger.error('__init__ 执行失败', { error: e })
        }
      }
      // __init__ 完成后触发 autoCurrentFirst / autoSelectFirst，
      // 确保脚本中的 currentRowChanged 订阅者能收到初始行事件。
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      pds.dataSet?.initAutoSelection()
    },
  })

  // ── 子 Composables ───────────────────────────────────────────────────────────

  const { scopedCss, setScopedCss } = useCssScope({
    pageId: currentPageId.value,
    enableScope: props.enableCssScope ?? true,
  })

  const pds = usePageDataSet({
    enableDataSet: props.enableDataSet ?? true,
  })
  const { initDataSet } = pds

  const { boundRules, rebindRules } = useRuleBinding({
    originalRules,
    pageData,
    pageFunctions,
    get dataSet() { return pds.dataSet },
    formApi,
    ...(registry !== undefined ? { registry } : {}),
  })

  // ── 脚本沙箱上下文（pageContext） ────────────────────────────────────────────
  // 通过 `with (__ctx)` 注入给业务脚本，脚本中可直接使用 $api / $data / h 等。
  // $api / $dataSet 使用 getter，保证脚本每次访问都拿到最新值。

  const pageContext: PageContext = {
    get $api()     { return formApi.value as FormCreateAPI | null },
    get $dataSet() { return pds.dataSet },

    $route:    route,
    $data:     pageData,
    $el:       () => pageContainer.value,
    $query:    (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll: (selector: string) => {
      if (pageContainer.value?.querySelectorAll)
        return pageContainer.value.querySelectorAll(selector)
      if (typeof document !== 'undefined')
        return document.querySelectorAll(selector)
      return [] as unknown as NodeListOf<Element>
    },

    $rebindRules:  () => rebindRules(),
    $refreshData:  async () => {},

    // PAGE_SERVICE 快捷访问（推荐脚本使用 $page.showMessage 替代直接调用 ElMessage）
    $page: pageService,

    // 历史全局变量 — 兼容旧脚本，新脚本请改用 $page
    ElMessage:    (props.messageService ?? ElMessage) as typeof ElMessage,
    ElMessageBox: (props.confirmService ?? ElMessageBox) as typeof ElMessageBox,

    SparkData,
    h,
  }

  // ── 配置加载流水线 ────────────────────────────────────────────────────────────

  /** 从 props / route 推断当前页面 ID，无法确定时抛出。 */
  function resolvePageId(): string {
    const pageId =
      props.pageId ??
      props.pageConfig?.pageId ??
      (route.meta['pageId'] as string | undefined) ??
      (route.params['id'] as string | undefined) ??
      (route.name as string | undefined)
    if (!pageId) {
      pageLogger.error('无法确定页面ID', { route: route.fullPath })
      throw new Error('配置无效: 无法确定页面ID')
    }
    return pageId
  }

  /** 通过 props.pageConfig 直传或 configLoader 异步加载页面配置。 */
  async function fetchConfig(pageId: string): Promise<PageConfig> {
    if (props.pageConfig) return props.pageConfig
    if (props.configLoader) {
      const result = await props.configLoader.loadPageConfig(pageId)
      if (!result.success || !result.data) {
        pageLogger.error('配置加载失败', { pageId, error: result.error })
        throw new Error(`配置加载失败: ${result.error ?? '未知错误'}`)
      }
      return result.data
    }
    throw new Error('配置无效: 未提供 configLoader 或 pageConfig')
  }

  /** 在沙箱中编译脚本，结果存入 pageFunctions（不执行 __init__）。 */
  function executeScript(pageId: string, scriptText: string): void {
    if (!scriptText) { pageFunctions.value = {}; return }
    try {
      pageFunctions.value = compileFunctions(scriptText, pageContext)
      pageLogger.info('📜 脚本编译成功', { pageId, functions: Object.keys(pageFunctions.value) })
    } catch (e) {
      pageLogger.error('脚本编译失败', { pageId, error: e })
      pageFunctions.value = {}
    }
  }

  /**
   * 将脚本中所有 `Render*` 函数包装为 Vue 组件并注册到全局 app。
   *
   * form-create 对字符串 type 调用 Vue 原生 `resolveComponent()`，
   * 必须通过 `app.component()` 注册，`formCreateOptions.global` 无效。
   *
   * **重复注册策略**：组件对每个 app 只注册一次（避免 Vue 的 "already registered" warn）。
   * 页面重新加载时，通过更新 `ShallowRef` 替换 render fn；
   * shallowRef 的响应性会自动触发组件重渲染，同时保持对 `pageData` 的正常依赖追踪。
   *
   * PascalCase + camelCase 均注册，兼容 form-create 内部的 toCase 转换。
   */
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
        // 已注册：只更新 ref，无需重新调用 app.component()
        const existingRef = fnMap.get(name)
        if (existingRef) existingRef.value = fn as () => unknown
      } else {
        // 首次注册：创建 ref，包装组件，注册到 app
        const fnRef = shallowRef<(() => unknown) | null>(fn as () => unknown)
        fnMap.set(name, fnRef)
        fnMap.set(camelName, fnRef)  // 大驼峰与小驼峰共享同一个 ref

        const comp = markRaw(defineComponent({
          name,
          // render fn 通过 fnRef 间接调用：
          //   - fnRef.value 变化（页面重载）→ shallowRef 响应性触发重渲染
          //   - fnRef.value() 内部访问 pageData.xxx → reactive 依赖追踪正常工作
          setup: () => () => fnRef.value?.(),
        }))
        vueApp.component(name, comp)
        vueApp.component(camelName, comp)
      }
    }
  }

  /**
   * 将配置应用到渲染状态，触发 form-create 挂载。
   *
   * 时序：
   * 1. rules / CSS / pageData 写入
   * 2. DataSet 初始化 + PAGE_DATASET 能力注入
   * 3. 脚本编译（不执行 __init__）
   * 4. Render* 函数注册为全局 Vue 组件
   * 5. nextTick + rebindRules → form-create 开始挂载
   * 6. form-create mounted 钩子 → 执行 __init__（$api 此时已就绪）
   */
  async function applyConfig(pageId: string, config: PageConfig): Promise<void> {
    originalRules.value = (config.rule ?? []) as unknown as Rule[]
    Object.assign(pageData, config.data)
    if (config.css) setScopedCss(config.css)

    initDataSet(config.data)
    const ds = pds.dataSet
    if (ds) provideCapability(PAGE_DATASET, ds)

    executeScript(pageId, config.script ?? '')
    registerRenderComponents()

    await nextTick()
    rebindRules()
  }

  /** 完整加载流程：beforeLoad → resolvePageId → fetchConfig → applyConfig → afterLoad。 */
  const loadPageConfig = async (): Promise<void> => {
    loading.value = true
    error.value   = ''
    try {
      const pageId = resolvePageId()
      currentPageId.value = pageId
      if (props.beforeLoad) await props.beforeLoad(pageId)
      const config = await fetchConfig(pageId)
      await applyConfig(pageId, config)
      if (props.afterLoad) await props.afterLoad(config)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      props.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      loading.value = false
    }
  }

  // ── 生命周期 ─────────────────────────────────────────────────────────────────
  // 仅在页面 ID 实际变化时重载，忽略 query / hash 等无关导航。

  watch(
    () => props.pageId ?? route.meta['pageId'] ?? route.params['id'] ?? route.name,
    (newId, oldId) => { if (newId !== oldId) void loadPageConfig() },
  )

  onMounted(() => { void loadPageConfig() })

  // ── 返回值 ───────────────────────────────────────────────────────────────────

  return {
    loading,
    error,
    currentPageId,
    scopedCss,
    boundRules,
    pageData,
    formApi,
    formCreateOptions,
    loadPageConfig,
    rebindRules,
    pageContext,
    get dataSet() { return pds.dataSet },
  }
}
