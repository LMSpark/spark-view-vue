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
  ref, watch, nextTick, getCurrentInstance, shallowRef, defineComponent, markRaw, inject,
} from 'vue'
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router'
import { Logger, PAGE_SERVICE } from '@spark-view/spark-utils'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import type { DataSet } from '@spark-view/spark-data'
import { DataSetCrudTool } from '@spark-view/spark-data'
import type { ConfigLoader, IPageRoute, PageConfig } from '@spark-view/spark-page-config'
import { nodeId, type SparkNode } from '../../core/types'
import { SparkNodeTree } from '../../core/spark-node-tree'
import { PAGE_DATASET, MODULE_CONTEXT, CSS_SCOPE, type ModuleContextCapability, type PageCssScopeCapability } from '../../core/capabilities'
import { PAGE_PERMISSION_MODE } from '../../permission/page-permission-mode'
import { useRendererSetup } from './useRendererSetup'
import { useCssScope } from './useCssScope'
import { usePageDataSet } from './usePageDataSet'
import { compileFunctions } from '../createSandbox'
import { buildPageService, type PageServiceOverrides } from '../services/buildPageService'
import { buildPageContext } from '../context/buildPageContext'
import { buildPageChildren } from '../binding'
import type { PageContext } from '../context/types'
import SparkComponentRenderer from '../../components/SparkComponentRenderer.vue'
import { SPARK_REGISTRY_KEY } from '../../system/keys.js'
import type { ComponentRegistry } from '../../core/types'

const logger = Logger('SparkPageRenderer')

type RenderFunction = (props?: Record<string, unknown>) => unknown
type RenderFunctionRef = ReturnType<typeof shallowRef<RenderFunction | null>>
const RENDER_FUNCTION_REGISTRY_KEY = Symbol.for('spark:page-render-function-registry')

type RenderFunctionRegistryOwner = {
  component(name: string): unknown
  component(name: string, component: object): void
} & Record<PropertyKey, unknown>

function getRenderFunctionRegistry(app: object): Map<string, RenderFunctionRef> {
  const owner = app as RenderFunctionRegistryOwner
  const existing = owner[RENDER_FUNCTION_REGISTRY_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, RenderFunctionRef>
  }

  const created = new Map<string, RenderFunctionRef>()
  owner[RENDER_FUNCTION_REGISTRY_KEY] = created
  return created
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
  const fnMap = getRenderFunctionRegistry(app)
  const vueApp = app as RenderFunctionRegistryOwner

  for (const [name, fn] of Object.entries(pageFunctions)) {
    if (!name.startsWith('Render') || typeof fn !== 'function') continue
    const camelName = name.charAt(0).toLowerCase() + name.slice(1)

    const existingRef = fnMap.get(name) ?? fnMap.get(camelName)
    if (existingRef) {
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
    vueApp.component(name, component)
    vueApp.component(camelName, component)
  }
}

// ==================== Props — h(type, props, children) ====================

/** 直传四文件输入（跳过 configLoader 异步加载，pageId 可选） */
type SparkPageNodePropsInput = Omit<PageConfig, 'pageId'> & { pageId?: string }

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
  messageService?: PageServiceOverrides['messageService']
  /** UI 确认对话框服务接口 */
  confirmService?: PageServiceOverrides['confirmService']
  /** 页面加载前钩子（loadNodeProps 之前） */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子（applyNodeProps 之后） */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** 错误处理函数 */
  onError?: (error: Error) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'spark-page',
  enableDataSet: true,
  enableCssScope: true,
})

// ==================== 基础设施 ====================

const { router, sparkProvide, sparkConsume, loading, error, componentRegistry, appServices, runLoad } = useRendererSetup('spark-page', logger)
const route = useRoute()
const vueApp = getCurrentInstance()?.appContext.app
const moduleContextCapability = sparkConsume(MODULE_CONTEXT) as ModuleContextCapability | null

// 子类型提升查询：从注册表 meta.liftAs 读取子组件自声明的区域角色
const sparkRegistry = inject<ComponentRegistry | undefined>(SPARK_REGISTRY_KEY, undefined)
const _liftAsCache = new Map<string, string | null>()
function getChildLiftAs(childType: string): string | undefined {
  const cached = _liftAsCache.get(childType)
  if (cached !== undefined) return cached ?? undefined
  const def = sparkRegistry?.get(childType)
  const liftAs = def?.meta?.['liftAs'] as string | undefined
  _liftAsCache.set(childType, liftAs ?? null)
  return liftAs
}

// PAGE_SERVICE
const pageService = buildPageService(router, {
  messageService: props.messageService,
  confirmService: props.confirmService,
  pageService: appServices.pageService,
})
sparkProvide(PAGE_SERVICE, pageService)

// ==================== 响应式状态 ====================

const currentPageId = ref('')
const children = shallowRef<SparkNode[]>([])
const pageFunctions = shallowRef<Record<string, (...args: unknown[]) => unknown>>({})
let _inFlightPageId: string | null = null

// ── SparkNodeTree：rule.json 的 SSoT（AI 编辑入口）──
let _nodeTree: SparkNodeTree | null = null
// ── DataSetCrudTool：pagedata.json 的 SSoT（AI 编辑入口）──
let _crudTool: DataSetCrudTool | null = null
const pageContainer = ref<HTMLElement | null>(null)

// ── CSS 作用域 ──
const { scopedCss, setScopedCss } = useCssScope({ enableScope: props.enableCssScope })
sparkProvide(CSS_SCOPE, { inject(css: string) { setScopedCss(currentPageId.value, css) } } satisfies PageCssScopeCapability)

// ── 页面权限模式 ──
sparkProvide(PAGE_PERMISSION_MODE, (route.meta['permissionMode'] as NavPermissionMode | undefined) ?? 'masked')

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
  callFunc: callPageFunction,
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
    ds.setAppServices(appServices)
    ds.setPageRoute(pageRoute)
    sparkProvide(PAGE_DATASET, ds)
    _crudTool = DataSetCrudTool.fromDataSet(ds)
  } else {
    _crudTool = null
  }

  // 4. rule → SparkNodeTree → buildPageChildren → children
  _nodeTree = new SparkNodeTree({
    root: { type: 'spark-page', props: { id: 'spark-page-root' }, children: nodeProps.rule as unknown as SparkNode[] },
  })
  rebuildChildren()
}

// ==================== 加载入口 ====================

/** 完整加载流程：解析当前 pageId → beforeLoad → loadNodeProps → applyNodeProps → afterLoad。 */
async function loadConfig(): Promise<void> {
  // system-page 路由不走 PageRenderer，防止 transition out-in 期间误触发
  // 但 pageConfig 直传模式不受此限制（如 DevPreviewTab 嵌入预览）
  if (!props.pageConfig && route.meta['type'] === 'system-page') return
  if (!props.pageConfig && route.matched.length === 0) return

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

/**
 * 从 SparkNodeTree 重建渲染用 children。
 *
 * AI 编辑 nodeTree 后调用此方法即可刷新 UI，无需重新加载四文件。
 */
function rebuildChildren(): void {
  if (!_nodeTree) {
    children.value = []
    return
  }
  const ruleNodes = _nodeTree.root.children ?? []
  children.value = buildPageChildren(ruleNodes as unknown as import('@spark-view/spark-page-config').RuleConfig[], {
    callFunc: callPageFunction,
    actionCtx,
    getLiftAs: getChildLiftAs,
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
  { immediate: true },
)

// ==================== Expose ====================

defineExpose({
  reload: loadConfig,
  loadConfig,
  pageContext,
  get dataSet(): DataSet | null { return pds.dataSet },
  /** rule.json 的 SSoT 节点树（AI 编辑入口）。页面未加载时为 null。 */
  get nodeTree(): SparkNodeTree | null { return _nodeTree },
  /** 从 nodeTree 重建渲染 children。AI 编辑 nodeTree 后调用以刷新 UI。 */
  rebuildChildren,
  /** pagedata.json 的 SSoT CRUD 工具（AI 编辑入口）。页面未加载时为 null。 */
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
