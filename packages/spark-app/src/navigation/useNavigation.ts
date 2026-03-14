import { computed, inject, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createRequest } from '@spark-view/spark-utils'
import type {
  ChildPlacement,
  NavContextConfig,
  NavContextInput,
  NavContextItem,
  NavContextState,
  NavNode,
  NavRoot,
  NavigationContext,
  RegionItems,
  RegionVisibility,
} from './nav-types'
import { NAV_KEY } from './nav-types'

/* ══════════════════════════════════════════════════════════
 * useNavigation — 应用导航核心 composable
 *
 * 在 App.vue 中调用一次，自动通过 Vue provide 向下注入。
 * 子组件通过 useNav() 消费。
 * ══════════════════════════════════════════════════════════ */

const CONTEXT_STORAGE_PREFIX = 'spark-nav-ctx:'
const _contextCache = new Map<string, NavContextItem[]>()

/** 约定优先：将简写形式归一化为完整 NavContextConfig */
function normalizeContextConfig(input: NavContextInput): NavContextConfig {
  // 字符串 → URL 简写
  if (typeof input === 'string') {
    return { source: input }
  }
  // 数组 → 静态列表
  if (Array.isArray(input)) {
    return { source: input }
  }
  // 已是完整配置
  return input
}

/** 将 source 解析为远程 URL（字符串直接作为 url） */
function resolveRemoteSource(source: string): { url: string } {
  return { url: source }
}

interface UseNavigationOptions {
  // reserved for future options
}

export function useNavigation(navRoot: NavRoot, _options?: UseNavigationOptions): NavigationContext {
  const route = useRoute()
  const router = useRouter()

  // ── 活动路径（从根到当前叶子） ──
  const _activePath = ref<NavNode[]>([])

  // ── 角标动态覆写 ──
  const _badges = reactive<Record<string, string | number | undefined>>({})

  // ── 模块上下文（单一状态，作用域 = 模块下全部页面） ──
  const _moduleContext = ref<NavContextState | null>(null)

  /** 模块节点缓存（key = moduleId），避免切换子页面时重建 */
  const _contextByModule = new Map<string, NavContextState>()

  // ── 路由变化 → 重算活动路径 + 模块上下文 ──

  /** 从实际路由路径中剥离租户前缀（/t/:tenantId/xxx → /xxx） */
  function stripTenantPrefix(path: string): string {
    const match = /^\/t\/[^/]+(.*)$/.exec(path)
    return match ? (match[1] ?? '/') : path
  }

  /** 为裸路径添加当前租户前缀（/xxx → /t/{tenantId}/xxx） */
  function addTenantPrefix(path: string): string {
    // 已有租户前缀或为根路径 / 登录路径 → 不转换
    if (path.startsWith('/t/')) return path
    const tenantId = route.params['tenantId']
    if (typeof tenantId === 'string' && tenantId) {
      return `/t/${tenantId}${path}`
    }
    return path
  }

  watch(
    () => route.path,
    (path) => {
      const shortPath = stripTenantPrefix(path)
      _activePath.value = findActivePath(navRoot.children, shortPath)
      syncModuleContext()
    },
    { immediate: true },
  )

  /* ────────────────────────────────────────────
   * 节点排序 & 过滤
   * ──────────────────────────────────────────── */

  function sortNodes(nodes: NavNode[]): NavNode[] {
    return [...nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  function filterVisible(nodes: NavNode[]): NavNode[] {
    return sortNodes(nodes).filter((n) => !n.hidden)
  }

  /* ────────────────────────────────────────────
   * 活动路径查找（DFS）
   * ──────────────────────────────────────────── */

  function findActivePath(nodes: NavNode[], targetPath: string): NavNode[] {
    for (const node of sortNodes(nodes)) {
      if (node.path === targetPath) return [node]
      if (node.children?.length) {
        const sub = findActivePath(node.children, targetPath)
        if (sub.length > 0) return [node, ...sub]
      }
    }
    return []
  }

  /* ────────────────────────────────────────────
   * 区域派生
   * ──────────────────────────────────────────── */

  const regionItems = computed<RegionItems>(() => {
    const regions: RegionItems = { header: [], sidebar: [], toolbar: [] }

    // 根级子项放入指定区域
    regions[navRoot.childPlacement] = filterVisible(navRoot.children)

    // 工具栏项（始终可见，与活动路径无关）
    if (navRoot.toolbar?.length) {
      regions.toolbar = filterVisible(navRoot.toolbar)
    }

    // 沿活动路径，每个有子节点的非叶节点根据 childPlacement 放入对应区域
    for (const node of _activePath.value) {
      if (!node.children?.length) continue
      const placement = resolveChildPlacement(node)
      // parent / flat 不创建新区域，由渲染组件内联处理
      if (placement === 'parent' || placement === 'flat') continue
      regions[placement] = filterVisible(node.children)
    }

    return regions
  })

  const regionVisibility = computed<RegionVisibility>(() => ({
    header: regionItems.value.header.length > 0,
    sidebar: regionItems.value.sidebar.length > 0,
    toolbar: regionItems.value.toolbar.length > 0,
  }))

  /** 解析 childPlacement（'parent' 向上追溯到祖先的非 parent 值） */
  function resolveChildPlacement(node: NavNode): ChildPlacement {
    const placement = node.childPlacement ?? 'sidebar'
    if (placement !== 'parent') return placement

    // 沿 activePath 向上查找最近的非 'parent' 祖先
    const idx = _activePath.value.indexOf(node)
    for (let i = idx - 1; i >= 0; i--) {
      const ancestor = _activePath.value[i]
      if (!ancestor) continue
      const ap = ancestor.childPlacement ?? 'sidebar'
      if (ap !== 'parent') return ap
    }

    // 兜底：回退到 root 的 childPlacement
    return navRoot.childPlacement
  }

  /* ────────────────────────────────────────────
   * 模块上下文管理（父级 = 模块 ID，作用域 = 模块下全部页面）
   * ──────────────────────────────────────────── */

  function syncModuleContext() {
    // 模块 = activePath 中的第一个节点（根的直接子节点）
    const moduleNode = _activePath.value[0] as NavNode | undefined
    if (moduleNode?.context === undefined) {
      _moduleContext.value = null
      return
    }

    // 约定优先：归一化简写 → NavContextConfig
    const config = normalizeContextConfig(moduleNode.context)

    // 同模块复用已有状态
    const cached = _contextByModule.get(moduleNode.id)
    if (cached) {
      _moduleContext.value = cached
      return
    }

    const state: NavContextState = reactive({
      config,
      nodeId: moduleNode.id,
      selected: restoreContextValue(moduleNode.id, config),
      items: [],
      loading: false,
      error: null,
    })
    void loadContextItems(state)
    _contextByModule.set(moduleNode.id, state)
    _moduleContext.value = state
  }

  async function loadContextItems(state: NavContextState) {
    const { source } = state.config

    // 静态数据
    if (Array.isArray(source)) {
      state.items = source
      return
    }

    // 约定优先：字符串 source 解析为 { url }
    const remote = resolveRemoteSource(source)

    // 缓存命中
    if (_contextCache.has(state.nodeId)) {
      state.items = _contextCache.get(state.nodeId) ?? []
      return
    }

    // 远程加载
    state.loading = true
    state.error = null
    try {
      const client = createRequest()
      const data = await client.request<unknown>({
        url: remote.url,
        method: 'GET',
      })

      const items = (Array.isArray(data) ? data : []) as NavContextItem[]
      state.items = items
      _contextCache.set(state.nodeId, items)
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
    } finally {
      state.loading = false
    }
  }

  function restoreContextValue(nodeId: string, config: NavContextConfig): string | number | null {
    // 优先从 URL query
    if (config.paramName !== undefined && config.paramName !== '') {
      const val = route.query[config.paramName]
      if (val !== null && val !== undefined && val !== '') return String(val)
    }

    // localStorage
    const stored = localStorage.getItem(CONTEXT_STORAGE_PREFIX + nodeId)
    if (stored !== null) {
      try {
        return JSON.parse(stored) as string | number
      } catch {
        // ignore
      }
    }

    // 默认值
    return config.defaultValue ?? null
  }

  function setContextValue(value: string | number | null) {
    const state = _moduleContext.value
    if (!state) return

    state.selected = value

    // 持久化
    if (value !== null) {
      localStorage.setItem(CONTEXT_STORAGE_PREFIX + state.nodeId, JSON.stringify(value))
    } else {
      localStorage.removeItem(CONTEXT_STORAGE_PREFIX + state.nodeId)
    }

    // 同步到 URL query（不含待移除的 key）
    if (state.config.paramName !== undefined && state.config.paramName !== '') {
      const paramName = state.config.paramName
      const newQuery: Record<string, string> = {}
      for (const [k, v] of Object.entries(route.query)) {
        if (k === paramName) continue
        if (typeof v === 'string') newQuery[k] = v
      }
      if (value !== null) {
        newQuery[paramName] = String(value)
      }
      void router.replace({ query: newQuery })
    }
  }

  /* ────────────────────────────────────────────
   * 导航操作
   * ──────────────────────────────────────────── */

  function navigateTo(node: NavNode) {
    if (node.disabled) return

    // 外部链接
    if (node.externalUrl) {
      window.open(node.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }

    // 重定向
    if (node.redirect) {
      void router.push(addTenantPrefix(node.redirect))
      return
    }

    // 叶子节点
    if (node.path) {
      void router.push(addTenantPrefix(node.path))
      return
    }

    // 组节点：跳转到第一个可见叶子
    if (node.children?.length) {
      const leaf = findFirstLeaf(node.children)
      if (leaf?.path) {
        void router.push(addTenantPrefix(leaf.path))
      }
    }
  }

  function findFirstLeaf(nodes: NavNode[]): NavNode | undefined {
    for (const node of filterVisible(nodes)) {
      if (node.disabled) continue
      if (node.path) return node
      if (node.children?.length) {
        const leaf = findFirstLeaf(node.children)
        if (leaf) return leaf
      }
    }
    return undefined
  }

  /* ────────────────────────────────────────────
   * 角标
   * ──────────────────────────────────────────── */

  function getBadge(nodeId: string): string | number | undefined {
    return _badges[nodeId]
  }

  function setBadge(nodeId: string, value: string | number | undefined) {
    _badges[nodeId] = value
  }

  /* ────────────────────────────────────────────
   * 活动判断
   * ──────────────────────────────────────────── */

  function isNodeActive(node: NavNode): boolean {
    return _activePath.value.some((n) => n.id === node.id)
  }

  /* ── 组装上下文并 provide ── */

  const context: NavigationContext = {
    activePath: computed(() => _activePath.value),
    regionItems,
    regionVisibility,
    moduleContext: computed(() => _moduleContext.value),
    navigateTo,
    setContextValue,
    isNodeActive,
    getBadge,
    setBadge,
  }

  provide(NAV_KEY, context)

  return context
}

/* ══════════════════════════════════════════════════════════
 * useNav — 子组件消费导航上下文
 * ══════════════════════════════════════════════════════════ */

export function useNav(): NavigationContext | null {
  return inject(NAV_KEY, null)
}
