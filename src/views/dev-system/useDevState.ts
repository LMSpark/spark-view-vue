/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心
 *
 * 设计原则：
 * - 站点树选中节点 → 驱动工作区所有面板
 * - AI 面板操作结果 → 自动刷新文件/树
 * - 统一 dirty 状态管理
 */
import { ref, reactive, computed } from 'vue'
import type { NavNode, NavRoot, NavContextItem } from '@spark-view/spark-app'
import { demoNavRoot } from '@/layout/demo-nav'

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export interface StatusMessage {
  text: string
  type: 'success' | 'warning' | 'error' | 'info'
  time: string
}

export interface DevEditForm {
  id: string
  title: string
  icon: string
  type: string
  description: string
  path: string
  pageType: string
  redirect: string
  externalUrl: string
  action: string
  childPlacement: string
  order: number
  hidden: boolean
  disabled: boolean
}

export interface ToolbarEditItem {
  id: string
  title: string
  icon: string
  action: string
  hidden: boolean
}

export interface DevContextConfig {
  placeholder: string
  defaultValue: string
  paramName: string
}

export const PAGE_FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
export type PageFileName = typeof PAGE_FILE_NAMES[number]

import { getPageApi, getNavApi } from '@/services/api-paths'
import { http } from '@/services/http'

// ═══════════════════════════════════════════════════════════
// 共享状态工厂 — 每个 DevSystem 实例一份
// ═══════════════════════════════════════════════════════════

export function useDevState() {
  // ── 导航树 ──
  const treeData = ref<NavNode[]>([])
  const navLoading = ref(false)
  const navSaving = ref(false)
  const navDirty = ref(false)
  const selectedNode = ref<NavNode | null>(null)

  // ── 节点编辑表单 ──
  const editForm = reactive<DevEditForm>({
    id: '', title: '', icon: '', type: '',
    description: '',
    path: '', pageType: '', redirect: '', externalUrl: '',
    action: '',
    childPlacement: '', order: 0,
    hidden: false, disabled: false,
  })
  const hasContext = ref(false)
  const contextItems = ref<Array<{ id: string; title: string }>>([])
  const contextConfig = reactive<DevContextConfig>({
    placeholder: '', defaultValue: '', paramName: '',
  })

  // ── 页面配置文件 ──
  const activePageId = ref('')  // 当前正在编辑的页面 ID（独立于树节点）
  const editFiles = reactive<Record<string, string>>({
    'rule.json': '', 'pagedata.json': '', 'script.js': '', 'style.css': '',
  })
  const fileDirty = reactive<Record<string, boolean>>({
    'rule.json': false, 'pagedata.json': false, 'script.js': false, 'style.css': false,
  })
  const fileSaving = ref(false)
  const fileLoaded = ref(false)

  // ── 工具栏管理 ──
  const toolbarItems = ref<ToolbarEditItem[]>([])

  // ── 空导航状态 ──
  const navEmpty = ref(false)

  // ── 页面列表 ──
  const pageList = ref<Array<Record<string, unknown>>>([])

  // ── 状态消息 ──
  const statusMessages = ref<StatusMessage[]>([])

  // ── AI 面板 ──
  const aiPanelVisible = ref(true)

  // ── 计算属性 ──
  const hasAnyFileDirty = computed(() => Object.values(fileDirty).some(Boolean))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)
  const previewJson = computed(() => {
    const root: NavRoot = { childPlacement: 'header', children: treeData.value }
    if (toolbarItems.value.length > 0) root.toolbar = toolbarItemsToNavNodes()
    return JSON.stringify(root, null, 2)
  })

  // ═══════════════════════════════════════════════════════════
  // 状态消息
  // ═══════════════════════════════════════════════════════════

  function addStatus(text: string, type: StatusMessage['type'] = 'info') {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    statusMessages.value.unshift({ text, type, time })
    if (statusMessages.value.length > 80) {
      statusMessages.value = statusMessages.value.slice(0, 80)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 数据加载
  // ═══════════════════════════════════════════════════════════

  async function loadNavConfig() {
    navLoading.value = true
    try {
      const config = await http.get<{ childPlacement?: string; children?: NavNode[]; toolbar?: NavNode[] }>(getNavApi())
      if (config.children?.length) {
        treeData.value = config.children
        navEmpty.value = false
      } else {
        treeData.value = []
        navEmpty.value = true
      }
      toolbarItems.value = (config.toolbar ?? []).map(n => ({
        id: n.id, title: n.title, icon: n.icon ?? '',
        action: n.action ?? '', hidden: n.hidden ?? false,
      }))
      addStatus('导航配置已加载', 'success')
    } catch {
      treeData.value = deepClone(demoNavRoot.children)
      navEmpty.value = false
      toolbarItems.value = []
      addStatus('导航加载失败，使用演示数据', 'warning')
    } finally {
      navLoading.value = false
    }
  }

  async function initSeedNavigation() {
    try {
      await http.put(getNavApi(), demoNavRoot)
      await loadNavConfig()
      addStatus('种子导航数据已初始化', 'success')
    } catch (e) {
      addStatus(`初始化失败: ${String(e)}`, 'error')
    }
  }

  async function loadPages() {
    try {
      pageList.value = await http.get<Array<Record<string, unknown>>>(`${getPageApi()}/__list`)
    } catch { /* ignore */ }
  }

  async function loadPageFiles(pageId: string) {
    activePageId.value = pageId
    fileLoaded.value = false
    for (const k of PAGE_FILE_NAMES) {
      fileDirty[k] = false
      editFiles[k] = ''
    }
    for (const fname of PAGE_FILE_NAMES) {
      try {
        const data = await http.get<Record<string, string>>(`${getPageApi()}/${encodeURIComponent(pageId)}/${fname}`)
        editFiles[fname] = data['content'] ?? ''
      } catch {
        editFiles[fname] = ''
      }
    }
    fileLoaded.value = true
    addStatus(`已加载 ${pageId} 配置文件`, 'info')
  }

  function clearFiles() {
    activePageId.value = ''
    fileLoaded.value = false
    for (const k of PAGE_FILE_NAMES) {
      editFiles[k] = ''
      fileDirty[k] = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点 ↔ 表单 同步
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: NavNode) {
    editForm.id = node.id
    editForm.title = node.title
    editForm.icon = node.icon ?? ''
    editForm.type = node.type
    editForm.description = node.description ?? ''
    editForm.path = node.path ?? ''
    editForm.pageType = node.pageType ?? ''
    editForm.redirect = node.redirect ?? ''
    editForm.externalUrl = node.externalUrl ?? ''
    editForm.action = node.action ?? ''
    editForm.childPlacement = node.childPlacement ?? ''
    editForm.order = node.order ?? 0
    editForm.hidden = node.hidden ?? false
    editForm.disabled = node.disabled ?? false

    if (node.context !== undefined) {
      hasContext.value = true
      if (Array.isArray(node.context)) {
        contextItems.value = node.context.map(i => ({ id: String(i.id), title: i.title }))
        contextConfig.placeholder = ''
        contextConfig.defaultValue = ''
        contextConfig.paramName = ''
      } else if (typeof node.context === 'object') {
        const cfg = node.context as {
          source?: unknown
          placeholder?: string
          defaultValue?: unknown
          paramName?: string
        }
        contextItems.value = Array.isArray(cfg.source)
          ? (cfg.source as NavContextItem[]).map(i => ({ id: String(i.id), title: i.title }))
          : []
        contextConfig.placeholder = cfg.placeholder ?? ''
        contextConfig.defaultValue = cfg.defaultValue !== null && cfg.defaultValue !== undefined ? String(cfg.defaultValue) : ''
        contextConfig.paramName = cfg.paramName ?? ''
      }
    } else {
      hasContext.value = false
      contextItems.value = []
      contextConfig.placeholder = ''
      contextConfig.defaultValue = ''
      contextConfig.paramName = ''
    }
    navDirty.value = false
  }

  function applyNavChanges() {
    if (!selectedNode.value) return
    const node = selectedNode.value
    const patch: Record<string, unknown> = { id: editForm.id, title: editForm.title }

    if (editForm.icon) patch['icon'] = editForm.icon
    patch['type'] = editForm.type
    if (editForm.description) patch['description'] = editForm.description
    if (editForm.path) patch['path'] = editForm.path
    if (editForm.pageType) patch['pageType'] = editForm.pageType
    if (editForm.redirect) patch['redirect'] = editForm.redirect
    if (editForm.externalUrl) patch['externalUrl'] = editForm.externalUrl
    if (editForm.action) patch['action'] = editForm.action
    if (editForm.childPlacement) patch['childPlacement'] = editForm.childPlacement
    if (editForm.order !== 0) patch['order'] = editForm.order
    if (editForm.hidden !== false) patch['hidden'] = editForm.hidden
    if (editForm.disabled !== false) patch['disabled'] = editForm.disabled

    if (hasContext.value && contextItems.value.length > 0) {
      const items = contextItems.value.filter(i => i.id && i.title)
      if (contextConfig.placeholder || contextConfig.defaultValue || contextConfig.paramName) {
        const ctx: Record<string, unknown> = { source: items }
        if (contextConfig.placeholder) ctx['placeholder'] = contextConfig.placeholder
        if (contextConfig.defaultValue) ctx['defaultValue'] = contextConfig.defaultValue
        if (contextConfig.paramName) ctx['paramName'] = contextConfig.paramName
        patch['context'] = ctx
      } else {
        patch['context'] = items
      }
    }

    // type / id / title 是必选字段，不参与清理循环
    const optKeys: Array<keyof NavNode> = [
      'icon', 'description', 'path', 'pageType', 'redirect', 'externalUrl', 'action',
      'childPlacement', 'order', 'hidden', 'disabled', 'context',
    ]
    for (const k of optKeys) {
      if (!(k in patch)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (node as Record<string, unknown>)[k]
      }
    }
    Object.assign(node, patch)
    navDirty.value = false
  }

  function markNavDirty() { navDirty.value = true }

  // ═══════════════════════════════════════════════════════════
  // 保存
  // ═══════════════════════════════════════════════════════════

  async function saveNavConfig() {
    if (navDirty.value) applyNavChanges()
    navSaving.value = true
    const root: NavRoot = { childPlacement: 'header', children: treeData.value }
    if (toolbarItems.value.length > 0) root.toolbar = toolbarItemsToNavNodes()
    try {
      await http.put(getNavApi(), root)
      navDirty.value = false
      addStatus('导航配置已保存', 'success')
    } catch (e) {
      addStatus(`导航保存失败: ${String(e)}`, 'error')
    } finally {
      navSaving.value = false
    }
  }

  // ── 节点级即时保存（RESTful CRUD）──

  /** 即时调用 PUT /api/navigation/nodes/{id} 保存表单变更 */
  async function saveNodeChanges() {
    applyNavChanges()
    if (!selectedNode.value) return
    const node = selectedNode.value
    const { children: _children, ...patch } = node
    try {
      await http.put(`${getNavApi()}/nodes/${encodeURIComponent(node.id)}`, patch)
      navDirty.value = false
      addStatus(`节点 ${node.title} 已保存`, 'success')
    } catch (e) {
      addStatus(`节点保存失败: ${String(e)}`, 'error')
    }
  }

  /** 从页面总览直接选中某页面进行编辑（不依赖树节点） */
  function selectPage(pageId: string) {
    void loadPageFiles(pageId)
  }

  async function savePageFiles() {
    const pageId = activePageId.value
    if (!pageId) return
    fileSaving.value = true
    try {
      await http.post(`${getPageApi()}/${encodeURIComponent(pageId)}/__batch`, editFiles)
      for (const k of PAGE_FILE_NAMES) fileDirty[k] = false
      addStatus(`页面 ${pageId} 已保存`, 'success')
      await loadPages()
    } catch (e) {
      addStatus(`文件保存失败: ${String(e)}`, 'error')
    } finally {
      fileSaving.value = false
    }
  }

  async function saveAll() {
    if (navDirty.value) await saveNavConfig()
    if (hasAnyFileDirty.value) await savePageFiles()
    if (!navDirty.value && !hasAnyFileDirty.value) {
      await saveNavConfig()
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点选中
  // ═══════════════════════════════════════════════════════════

  function selectNode(node: NavNode) {
    if (navDirty.value && selectedNode.value) applyNavChanges()
    selectedNode.value = node
    loadNodeToForm(node)
    const pageId = node.path ? node.path.replace(/^\/+/, '') : ''
    if (pageId) {
      void loadPageFiles(pageId)
    } else {
      clearFiles()
    }
  }

  function handlePathChange(val: string) {
    markNavDirty()
    const pageId = val ? val.replace(/^\/+/, '') : ''
    if (pageId) {
      void loadPageFiles(pageId)
    } else {
      clearFiles()
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 树增删
  // ═══════════════════════════════════════════════════════════

  function addRootNode() {
    const id = `module-${Date.now()}`
    const node: NavNode = { id, type: 'group', title: '新模块', icon: '📁', childPlacement: 'sidebar', children: [] }
    treeData.value.push(node)
    void http.post(`${getNavApi()}/nodes`, { node }).then(
      () => addStatus('已添加根模块', 'info'),
      (e: unknown) => addStatus(`添加模块失败: ${String(e)}`, 'error'),
    )
  }

  function addChildNode(parent: NavNode) {
    const id = `page-${Date.now()}`
    const node: NavNode = { id, type: 'item', title: '新页面', icon: '📄', path: `/${id}` }
    ;(parent.children ??= []).push(node)
    void http.post(`${getNavApi()}/nodes`, { parentId: parent.id, node }).then(
      () => addStatus(`已在 ${parent.title} 下添加子节点`, 'info'),
      (e: unknown) => addStatus(`添加节点失败: ${String(e)}`, 'error'),
    )
  }

  function removeNodeFromTree(node: { parent: { data: NavNode } }, data: NavNode) {
    const parent = node.parent
    if (parent.data.children) {
      const idx = parent.data.children.indexOf(data)
      if (idx >= 0) parent.data.children.splice(idx, 1)
    } else {
      const idx = treeData.value.indexOf(data)
      if (idx >= 0) treeData.value.splice(idx, 1)
    }
    if (selectedNode.value === data) {
      selectedNode.value = null
      clearFiles()
    }
    // 即时持久化
    void http.delete(`${getNavApi()}/nodes/${encodeURIComponent(data.id)}`).then(
      () => addStatus(`已删除 ${data.title}`, 'info'),
      (e: unknown) => addStatus(`删除节点失败: ${String(e)}`, 'error'),
    )
  }

  function resetToDemo() {
    treeData.value = deepClone(demoNavRoot.children)
    toolbarItems.value = []
    navEmpty.value = false
    selectedNode.value = null
    navDirty.value = false
    clearFiles()
    addStatus('已重置为演示数据', 'info')
  }

  // ═══════════════════════════════════════════════════════════
  // 工具栏管理
  // ═══════════════════════════════════════════════════════════

  function toolbarItemsToNavNodes(): NavNode[] {
    return toolbarItems.value.map(item => {
      const node: NavNode = { id: item.id, type: 'item', title: item.title }
      if (item.icon) node.icon = item.icon
      if (item.hidden) node.hidden = true
      if (item.action) node.action = item.action
      return node
    })
  }

  function addToolbarItem() {
    toolbarItems.value.push({ id: `tb-${Date.now()}`, title: '', icon: '', action: '', hidden: false })
    markNavDirty()
  }

  function removeToolbarItem(idx: number) {
    toolbarItems.value.splice(idx, 1)
    markNavDirty()
  }

  // ═══════════════════════════════════════════════════════════
  // 上下文编辑
  // ═══════════════════════════════════════════════════════════

  function toggleContext(val: boolean) {
    if (val && contextItems.value.length === 0) contextItems.value.push({ id: '', title: '' })
    markNavDirty()
  }
  function addContextItem() { contextItems.value.push({ id: '', title: '' }); markNavDirty() }
  function removeContextItem(idx: number) { contextItems.value.splice(idx, 1); markNavDirty() }

  // ═══════════════════════════════════════════════════════════
  // 新建页面
  // ═══════════════════════════════════════════════════════════

  async function createPage(pageId: string, title: string, icon: string, linkToNav: boolean) {
    await http.post(`${getPageApi()}/__create`, { pageId, title, icon })

    if (linkToNav && selectedNode.value) {
      editForm.path = `/${pageId}`
      markNavDirty()
      applyNavChanges()
      await saveNavConfig()
      void loadPageFiles(pageId)
    }

    await loadPages()
    addStatus(`页面 ${pageId} 创建成功`, 'success')
  }

  // ── 工具 ──
  function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) as T }

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize() {
    await Promise.all([loadNavConfig(), loadPages()])
  }

  return {
    // 导航树
    treeData,
    navLoading,
    navSaving,
    navDirty,
    selectedNode,

    // 编辑表单
    editForm,
    hasContext,
    contextItems,
    contextConfig,
    // 工具栏
    toolbarItems,

    // 空导航状态
    navEmpty,
    // 文件编辑
    activePageId,
    editFiles,
    fileDirty,
    fileSaving,
    fileLoaded,

    // 页面列表
    pageList,

    // 状态
    statusMessages,
    aiPanelVisible,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,
    previewJson,

    // 方法
    addStatus,
    loadNavConfig,
    loadPages,
    loadPageFiles,
    clearFiles,
    selectPage,
    loadNodeToForm,
    applyNavChanges,
    markNavDirty,
    saveNavConfig,
    saveNodeChanges,
    savePageFiles,
    saveAll,
    selectNode,
    handlePathChange,
    addRootNode,
    addChildNode,
    removeNodeFromTree,
    resetToDemo,
    initSeedNavigation,
    toolbarItemsToNavNodes,
    addToolbarItem,
    removeToolbarItem,
    toggleContext,
    addContextItem,
    removeContextItem,
    createPage,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
