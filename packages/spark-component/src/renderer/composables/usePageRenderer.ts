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
  ref, shallowRef, onMounted, watch, nextTick,
  inject, defineComponent, markRaw,
  type App, type Ref, type Component, type ShallowRef,
} from 'vue'
import { useRoute } from 'vue-router'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import type { IPageRoute } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import { PAGE_DATASET } from '../../capability-keys'
import { SPARK_REGISTRY_KEY } from '../../core/types.js'
import { usePageDataSet } from './usePageDataSet'
import { useRendererSetup } from './useRendererSetup'
import type { PageRendererOptions, PageContext, Rule, PageConfig, FormCreateAPI } from '../types'
import { useCssScope } from './useCssScope'
import { useRuleBinding } from './useRuleBinding'
import { compileFunctions } from '../utils/createSandbox'
import { buildPageService } from '../utils/buildPageService'
import { buildPageContext } from '../utils/buildPageContext'
import { pageLogger } from '../utils/bind-helpers'

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
  /** form-create API（使用官方 Api 类型） */
  formApi: Ref<FormCreateAPI | null>
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

  // ── 共享基础设施（SPARK 上下文 + 加载状态机 + 竞态保护） ──
  const { router, provideCapability, loading, error, runLoad } = useRendererSetup('page-renderer', pageLogger)

  const route = useRoute()

  // 框架无关路由快照（脚本只需读取此接口，无 Vue Router 依赖）
  const pageRoute: IPageRoute = {
    get path()     { return route.path },
    get fullPath() { return route.fullPath },
    get name()     { return route.name ?? null },
    get params()   { return route.params as Record<string, string | string[]> },
    get query()    { return route.query  as Record<string, string | string[] | null> },
    get hash()     { return route.hash },
  }

  // 组件注册表：供 useRuleBinding 查询 dataKey 行为元数据
  const registry = inject(SPARK_REGISTRY_KEY, undefined)

  // PAGE_SERVICE：优先使用 props 注入的 UI 服务（测试/Storybook），回退到 Element Plus
  const pageService = buildPageService(router, {
    messageService: props.messageService,
    confirmService: props.confirmService,
  })
  provideCapability(PAGE_SERVICE, pageService)

  // ── 响应式状态 ───────────────────────────────────────────────────────────────

  const currentPageId = ref<string>('')
  const formApi       = ref<FormCreateAPI | null>(null)
  const originalRules = ref<unknown[]>([])
  /** 脚本沙箱编译后的函数表；`__init__` 由 form-create mounted 钩子调用 */
  const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})

  // ── form-create 配置 ─────────────────────────────────────────────────────────
  // DataSet 在 applyConfig 中初始化（早于 rebindRules），使 dataKey 一次绑定即解析到真实数据。
  // mounted 每次都会触发（loading toggle 导致 form-create 销毁/重建），
  // 但 mounted 时机晚于 rebindRules，若在此初始化 DataSet 则需二次绑定，浪费一轮。
  // mounted 仅负责：__init__（需要 $api 就绪）和 initAutoSelection（需要 el-table 在 DOM）。
  // ⚠️ formData 双向绑定暂时禁用，会导致 DataSet 事件死循环。

  const formCreateOptions = ref({
    ...DEFAULT_FORM_CREATE_OPTIONS,
    ...props.formCreateOptions,
    mounted: () => {
      // __init__：$api 已就绪，$dataSet 已在 applyConfig 中初始化
      const init = pageFunctions.value['__init__']
      if (typeof init === 'function') {
        try {
          init()
          pageLogger.info('✅ __init__ 执行成功')
        } catch (e) {
          pageLogger.error('__init__ 执行失败', { error: e })
        }
      }
      // 触发 autoCurrentFirst / autoSelectFirst，
      // 确保脚本中的 currentRowChanged 订阅者能收到初始行事件。
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
    pageFunctions,
    get dataSet() { return pds.dataSet },
    formApi,
    ...(registry !== undefined ? { registry } : {}),
  })

  // ── 脚本沙箱上下文（pageContext） ────────────────────────────────────────────
  // 通过 `with (__ctx)` 注入给业务脚本，脚本中可直接使用 $api / $dataSet / h 等。

  const pageContext: PageContext = buildPageContext({
    formApi,
    getDataSet: () => pds.dataSet,
    pageRoute,
    pageContainer,
    rebindRules,
    pageService,
  })

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
   * shallowRef 的响应性会自动触发组件重渲染。
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
          //   - fnRef.value() 内部访问响应式数据 → reactive 依赖追踪正常工作
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
   * 1. rules / CSS 写入 → 脚本编译 → Render* 注册
   * 2. DataSet 直接初始化（wrapInstance 在 SparkPlugin.install 时已设定）
   * 3. nextTick + rebindRules（DataSet 已就绪，dataKey 一次解析到真实数据）
   * 4. loading=false → form-create 挂载 → mounted 回调执行 __init__ + autoSelection
   *
   * 关键设计：DataSet 在 rebindRules 之前初始化，
   * 使 dataKey 一次绑定即可解析，无需先空绑再二次绑定。
   * （mounted 每次必触发——loading toggle 销毁/重建 form-create——但时机晚于 rebindRules。）
   */
  async function applyConfig(pageId: string, config: PageConfig): Promise<void> {
    originalRules.value = config.rule as unknown as Rule[]
    if (config.css) setScopedCss(config.css)

    executeScript(pageId, config.script ?? '')
    registerRenderComponents()

    // 直接初始化 DataSet（wrapInstance 已在 SparkPlugin.install() 时设定）
    if (pds.dataSet) pds.clearDataSet()
    initDataSet(config.data)
    const ds = pds.dataSet
    if (ds) provideCapability(PAGE_DATASET, ds)

    await nextTick()
    rebindRules()
  }

  /** 完整加载流程：beforeLoad → resolvePageId → fetchConfig → applyConfig → afterLoad。 */
  const loadPageConfig = async (): Promise<void> => {
    await runLoad(async (isStale) => {
      const pageId = resolvePageId()
      currentPageId.value = pageId
      if (props.beforeLoad) await props.beforeLoad(pageId)
      if (isStale()) return
      const config = await fetchConfig(pageId)
      if (isStale()) return
      await applyConfig(pageId, config)
      if (isStale()) return
      if (props.afterLoad) await props.afterLoad(config)
    }, props.onError)
  }

  // ── 生命周期 ─────────────────────────────────────────────────────────────────
  // 仅在页面 ID 实际变化时重载，忽略 query / hash 等无关导航。

  watch(
    () => props.pageId ?? route.meta['pageId'] ?? route.params['id'] ?? route.name,
    (newId, oldId) => { if (newId !== oldId) loadPageConfig().catch(e => pageLogger.error('loadPageConfig 未预期异常', e)) },
  )

  onMounted(() => { loadPageConfig().catch(e => pageLogger.error('loadPageConfig 未预期异常', e)) })

  // ── 返回值 ───────────────────────────────────────────────────────────────────

  return {
    loading,
    error,
    currentPageId,
    scopedCss,
    boundRules,
    formApi,
    formCreateOptions,
    loadPageConfig,
    rebindRules,
    pageContext,
    get dataSet() { return pds.dataSet },
  }
}
