/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心
 *
 * 设计原则：
 * - 站点树选中节点 → 驱动工作区所有面板
 * - AI 面板操作结果 → 自动刷新文件/树
 * - 统一 dirty 状态管理
 */
import { ref, reactive, computed } from 'vue'
import type { LinkRenderMode, NavNode, NavRoot, NavContextItem, NavNodeKind } from '@spark-view/spark-app'
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
  nodeKind: NavNodeKind
  type: string
  dividerAfter: boolean
  description: string
  path: string
  redirect: string
  externalUrl: string
  linkRenderMode: LinkRenderMode
  action: string
  parentPageId: string
  childPlacement: string
  order: number
  hidden: boolean
  disabled: boolean
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
  const SYSTEM_ROOT_DIRECTORY_IDS = new Set(['__toolbar__', '__user-menu__'])
  const DEFAULT_ICON_BY_KIND: Record<NavNodeKind, string> = {
    'system-directory': 'FolderOpened',
    'module': 'FolderOpened',
    'system-page': 'Monitor',
    'page': 'Document',
    'link': 'Link',
    'sub-page': 'Document',
  }
  const ROOT_CHILD_PLACEMENTS = new Set(['header', 'sidebar'])

  // ── 导航树 ──
  const treeData = ref<NavNode[]>([])
  const navLoading = ref(false)
  const navSaving = ref(false)
  const navDirty = ref(false)
  const selectedNode = ref<NavNode | null>(null)

  // ── 节点编辑表单 ──
  const editForm = reactive<DevEditForm>({
    id: '', title: '', icon: '', nodeKind: 'page', type: '',
    dividerAfter: false,
    description: '',
    path: '', redirect: '', externalUrl: '', linkRenderMode: 'iframe',
    action: '', parentPageId: '',
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

  // ── 空导航状态 ──
  const navEmpty = ref(false)

  // ── 页面列表 ──
  const pageList = ref<Array<Record<string, unknown>>>([])

  // ── 状态消息 ──
  const statusMessages = ref<StatusMessage[]>([])
  const linkProbeLoading = ref(false)
  const linkProbeInfo = ref<{ embeddable: boolean; reason: string } | null>(null)

  // ── AI 面板 ──
  const aiPanelVisible = ref(true)

  // ── 计算属性 ──
  const hasAnyFileDirty = computed(() => Object.values(fileDirty).some(Boolean))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)
  const previewJson = computed(() => {
    const root: NavRoot = { title: '', childPlacement: 'header', children: treeData.value }
    return JSON.stringify(root, null, 2)
  })

  function normalizePageIdFromPath(path: string | undefined | null): string {
    return path ? path.replace(/^\/+/, '').trim() : ''
  }

  function isConfigNodeKind(nodeKind: NavNodeKind): boolean {
    return nodeKind === 'page' || nodeKind === 'sub-page'
  }

  function findPageMeta(pageId: string): Record<string, unknown> | undefined {
    return pageList.value.find((p) => String(p['pageId'] ?? '') === pageId)
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = findPageMeta(pageId)
    if (!pageMeta) return true
    return String(pageMeta['pageType'] ?? 'config') !== 'vue-component'
  }

  function isSystemRootDirectory(node: NavNode | null | undefined): boolean {
    if (!node) return false
    if (!SYSTEM_ROOT_DIRECTORY_IDS.has(node.id)) return false
    return treeData.value.some((rootNode) => rootNode.id === node.id)
  }

  function isPageLikeKind(kind: NavNodeKind): boolean {
    return kind === 'page' || kind === 'system-page' || kind === 'link' || kind === 'sub-page'
  }

  function findParentNodeById(nodes: NavNode[], targetId: string, parent: NavNode | null = null): NavNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return parent
      if (Array.isArray(node.children)) {
        const found = findParentNodeById(node.children, targetId, node)
        if (found) return found
      }
    }
    return null
  }

  function getParentNode(node: NavNode | null | undefined): NavNode | null {
    if (!node) return null
    return findParentNodeById(treeData.value, node.id)
  }

  function canUseModuleNodeKind(node: NavNode | null | undefined): boolean {
    const parent = getParentNode(node)
    if (!parent) return true
    const parentKind = inferNodeKind(parent)
    return !isPageLikeKind(parentKind)
  }

  function inferNodeKind(node: NavNode): NavNodeKind {
    if (SYSTEM_ROOT_DIRECTORY_IDS.has(node.id)) return 'system-directory'
    if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
    if (node.nodeKind !== undefined) return node.nodeKind
    if (typeof node.externalUrl === 'string' && node.externalUrl.trim() !== '') return 'link'
    return 'page'
  }

  function normalizeLinkRenderMode(value: unknown): LinkRenderMode {
    return value === 'new-tab' ? 'new-tab' : 'iframe'
  }

  function defaultIconByKind(kind: NavNodeKind): string {
    return DEFAULT_ICON_BY_KIND[kind]
  }

  function syncIconByNodeKind(nextKind: NavNodeKind, previousKind: NavNodeKind) {
    const previousDefault = defaultIconByKind(previousKind)
    const nextDefault = defaultIconByKind(nextKind)
    if (!editForm.icon || editForm.icon === previousDefault) {
      editForm.icon = nextDefault
    }
  }

  function applyNodeKindToNode(node: NavNode): NavNode {
    const cloned = deepClone(node)
    cloned.nodeKind = inferNodeKind(cloned)
    cloned.type = cloned.nodeKind === 'module' || cloned.nodeKind === 'system-directory' ? 'group' : 'item'
    if (cloned.nodeKind === 'sub-page') {
      cloned.hidden = true
      delete cloned.path
      delete cloned.redirect
      delete cloned.externalUrl
      delete cloned.linkRenderMode
      delete cloned.action
    } else if (cloned.nodeKind === 'link') {
      delete cloned.path
      delete cloned.redirect
      delete cloned.action
      delete cloned.parentPageId
      cloned.linkRenderMode = normalizeLinkRenderMode(cloned.linkRenderMode)
    } else {
      delete cloned.linkRenderMode
    }
    if (Array.isArray(cloned.children)) {
      cloned.children = cloned.children.map(applyNodeKindToNode)
    }
    return cloned
  }

  function applyNodeKindPreset(kind: NavNodeKind) {
    const previousKind = editForm.nodeKind
    editForm.nodeKind = kind
    syncIconByNodeKind(kind, previousKind)

    if (kind === 'system-directory') {
      editForm.type = 'group'
      editForm.hidden = false
      editForm.path = ''
      editForm.action = ''
      editForm.redirect = ''
      editForm.externalUrl = ''
      editForm.linkRenderMode = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'module') {
      editForm.type = 'group'
      editForm.hidden = false
      editForm.path = ''
      editForm.action = ''
      editForm.externalUrl = ''
      editForm.linkRenderMode = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'system-page') {
      editForm.type = 'item'
      editForm.hidden = false
      editForm.linkRenderMode = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'page') {
      editForm.type = 'item'
      editForm.hidden = false
      editForm.action = ''
      editForm.externalUrl = ''
      editForm.linkRenderMode = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'link') {
      editForm.type = 'item'
      editForm.hidden = false
      editForm.path = ''
      editForm.action = ''
      editForm.redirect = ''
      editForm.linkRenderMode = normalizeLinkRenderMode(editForm.linkRenderMode)
      editForm.parentPageId = ''
      return
    }

    editForm.type = 'item'
    editForm.hidden = true
    editForm.path = ''
    editForm.redirect = ''
    editForm.externalUrl = ''
    editForm.linkRenderMode = 'iframe'
    editForm.action = ''
  }

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

  function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
    return ROOT_CHILD_PLACEMENTS.has(String(value ?? '').trim())
      ? (value as 'header' | 'sidebar')
      : 'header'
  }

  function buildMigratedNavRoot(config: { title?: string; childPlacement?: string; children?: NavNode[]; homePath?: string }): NavRoot {
    const root: NavRoot = {
      title: config.title ?? '',
      childPlacement: normalizeRootChildPlacement(config.childPlacement),
      children: (config.children ?? []).map(applyNodeKindToNode),
    }
    const homePath = typeof config.homePath === 'string' ? config.homePath.trim() : ''
    if (homePath) {
      root.homePath = homePath
    }
    return root
  }

  function isNavConfigChanged(raw: { childPlacement?: string; children?: NavNode[]; homePath?: string }, migrated: NavRoot): boolean {
    const rawComparable: Record<string, unknown> = {
      childPlacement: normalizeRootChildPlacement(raw.childPlacement),
      children: raw.children ?? [],
    }
    const rawHomePath = typeof raw.homePath === 'string' ? raw.homePath.trim() : ''
    if (rawHomePath) {
      rawComparable['homePath'] = rawHomePath
    }
    return JSON.stringify(rawComparable) !== JSON.stringify(migrated)
  }

  async function loadNavConfig() {
    navLoading.value = true
    try {
      const config = await http.get<{ childPlacement?: string; children?: NavNode[]; homePath?: string }>(getNavApi())
      const migratedRoot = buildMigratedNavRoot(config)
      const hasLegacyDiff = isNavConfigChanged(config, migratedRoot)

      if (hasLegacyDiff) {
        try {
          await http.put(getNavApi(), migratedRoot)
          addStatus('检测到历史导航结构，已自动迁移并回写', 'info')
        } catch (e) {
          addStatus(`历史导航迁移回写失败: ${String(e)}`, 'warning')
        }
      }

      const normalizedChildren = migratedRoot.children

      if (normalizedChildren.length > 0) {
        treeData.value = normalizedChildren
        navEmpty.value = false
      } else {
        treeData.value = []
        navEmpty.value = true
      }

      addStatus('导航配置已加载', 'success')
    } catch {
      treeData.value = deepClone(demoNavRoot.children).map(applyNodeKindToNode)
      navEmpty.value = false
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
    if (!pageId) {
      clearFiles()
      return
    }
    if (!isBackendConfigPage(pageId)) {
      clearFiles()
      addStatus(`页面 ${pageId} 为 vue-component，配置文件由前端组件维护`, 'info')
      return
    }

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

  function onExternalUrlChanged() {
    markNavDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkRenderMode() {
    const url = editForm.externalUrl.trim()
    if (!url) {
      addStatus('请先输入超链接地址', 'warning')
      return
    }

    linkProbeLoading.value = true
    try {
      const result = await http.post<Record<string, unknown>>(`${getNavApi()}/link-probe`, { url })
      const mode = normalizeLinkRenderMode(result['recommendedMode'])
      const embeddable = Boolean(result['embeddable'])
      const reason = String(result['reason'] ?? '')

      editForm.linkRenderMode = mode
      linkProbeInfo.value = { embeddable, reason }
      markNavDirty()

      addStatus(
        embeddable
          ? '链接检测通过：已标记为 iframe 渲染'
          : '链接检测提示禁止嵌入：已标记为新标签打开',
        embeddable ? 'success' : 'warning',
      )
    } catch (e) {
      addStatus(`链接检测失败: ${String(e)}`, 'warning')
    } finally {
      linkProbeLoading.value = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点 ↔ 表单 同步
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: NavNode) {
    editForm.id = node.id
    editForm.title = node.title
    editForm.icon = node.icon ?? ''
    editForm.nodeKind = inferNodeKind(node)
    editForm.type = node.type
    editForm.dividerAfter = node.dividerAfter ?? false
    editForm.description = node.description ?? ''
    editForm.path = node.path ?? ''
    editForm.redirect = node.redirect ?? ''
    editForm.externalUrl = node.externalUrl ?? ''
    editForm.linkRenderMode = normalizeLinkRenderMode(node.linkRenderMode)
    editForm.action = node.action ?? ''
    editForm.parentPageId = node.parentPageId ?? ''
    editForm.childPlacement = node.childPlacement ?? ''
    editForm.order = node.order ?? 0
    editForm.hidden = node.hidden ?? false
    editForm.disabled = node.disabled ?? false

    if (!editForm.icon) {
      editForm.icon = defaultIconByKind(editForm.nodeKind)
    }

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
    linkProbeInfo.value = null
  }

  function applyNavChanges() {
    if (!selectedNode.value) return
    const node = selectedNode.value
    if (isSystemRootDirectory(node)) {
      loadNodeToForm(node)
      navDirty.value = false
      addStatus(`系统目录 ${node.title} 不可修改目录属性，仅可编辑子项`, 'warning')
      return
    }

    if (editForm.nodeKind === 'module' && !canUseModuleNodeKind(node)) {
      applyNodeKindPreset('page')
      addStatus('页面下不能创建模块，已自动改为普通页面', 'warning')
    }

    const patch: Record<string, unknown> = { id: editForm.id, title: editForm.title, nodeKind: editForm.nodeKind }

    if (editForm.nodeKind === 'sub-page') {
      editForm.type = 'item'
      editForm.hidden = true
      editForm.path = ''
      editForm.redirect = ''
      editForm.externalUrl = ''
      editForm.linkRenderMode = 'iframe'
      editForm.action = ''
    } else if (editForm.nodeKind === 'link') {
      editForm.type = 'item'
      editForm.path = ''
      editForm.redirect = ''
      editForm.action = ''
      editForm.linkRenderMode = normalizeLinkRenderMode(editForm.linkRenderMode)
      editForm.parentPageId = ''
    } else if (editForm.nodeKind === 'system-page') {
      editForm.externalUrl = ''
      editForm.linkRenderMode = 'iframe'
      editForm.parentPageId = ''
    } else if (editForm.nodeKind === 'page') {
      editForm.action = ''
      editForm.externalUrl = ''
      editForm.linkRenderMode = 'iframe'
      editForm.parentPageId = ''
    }

    if (editForm.icon) patch['icon'] = editForm.icon
    patch['type'] = editForm.type
    if (editForm.dividerAfter) patch['dividerAfter'] = true
    if (editForm.description) patch['description'] = editForm.description
    if (editForm.path) patch['path'] = editForm.path
    if (editForm.redirect) patch['redirect'] = editForm.redirect
    if (editForm.externalUrl) patch['externalUrl'] = editForm.externalUrl
    if (editForm.nodeKind === 'link') patch['linkRenderMode'] = editForm.linkRenderMode
    if (editForm.action) patch['action'] = editForm.action
    if (editForm.parentPageId) patch['parentPageId'] = editForm.parentPageId
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
      'icon', 'description', 'path', 'redirect', 'externalUrl', 'linkRenderMode', 'action',
      'parentPageId', 'childPlacement', 'order', 'hidden', 'disabled', 'context',
      'dividerAfter', 'nodeKind',
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
    const root: NavRoot = { title: '', childPlacement: 'header', children: treeData.value }
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
    if (isSystemRootDirectory(node)) {
      navDirty.value = false
      addStatus(`系统目录 ${node.title} 仅允许编辑子项，跳过节点保存`, 'warning')
      return
    }
    const { children: _children, ...patch } = node
    navSaving.value = true
    try {
      await http.put(`${getNavApi()}/nodes/${encodeURIComponent(node.id)}`, patch)
      navDirty.value = false
      addStatus(`节点 ${node.title} 已保存`, 'success')
    } catch (e) {
      addStatus(`节点保存失败: ${String(e)}`, 'error')
    } finally {
      navSaving.value = false
    }
  }

  /** 从页面总览直接选中某页面进行编辑（不依赖树节点） */
  function selectPage(pageId: string) {
    if (!isBackendConfigPage(pageId)) {
      clearFiles()
      addStatus(`页面 ${pageId} 为 vue-component，不提供后端配置文件编辑`, 'warning')
      return
    }
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
    if (navDirty.value) {
      if (selectedNode.value) {
        await saveNodeChanges()
      } else {
        await saveNavConfig()
      }
    }
    if (hasAnyFileDirty.value) await savePageFiles()
    if (!navDirty.value && !hasAnyFileDirty.value) {
      if (selectedNode.value) {
        await saveNodeChanges()
      } else {
        await saveNavConfig()
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点选中
  // ═══════════════════════════════════════════════════════════

  function selectNode(node: NavNode) {
    if (navDirty.value && selectedNode.value) applyNavChanges()
    selectedNode.value = node
    loadNodeToForm(node)
    const pageId = normalizePageIdFromPath(node.path)
    if (pageId && isConfigNodeKind(inferNodeKind(node))) {
      void loadPageFiles(pageId)
    } else {
      clearFiles()
    }
  }

  function handlePathChange(val: string) {
    markNavDirty()
    const pageId = normalizePageIdFromPath(val)
    if (pageId && isConfigNodeKind(editForm.nodeKind)) {
      void loadPageFiles(pageId)
    } else {
      clearFiles()
    }
  }

  function handleNodeKindChange(kind: NavNodeKind) {
    if (kind === 'module' && !canUseModuleNodeKind(selectedNode.value)) {
      addStatus('页面下不能创建模块', 'warning')
      const fallbackKind = selectedNode.value ? inferNodeKind(selectedNode.value) : 'page'
      applyNodeKindPreset(fallbackKind)
      return
    }

    applyNodeKindPreset(kind)
    markNavDirty()
    const pageId = normalizePageIdFromPath(editForm.path)
    if (pageId && isConfigNodeKind(editForm.nodeKind)) {
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
    const node: NavNode = {
      id,
      type: 'group',
      nodeKind: 'module',
      title: '新模块',
      icon: 'FolderOpened',
      childPlacement: 'sidebar',
      children: [],
    }
    treeData.value.push(node)
    void http.post(`${getNavApi()}/nodes`, { node }).then(
      () => addStatus('已添加根模块', 'info'),
      (e: unknown) => addStatus(`添加模块失败: ${String(e)}`, 'error'),
    )
  }

  function hasReservedRootGroup(id: '__toolbar__' | '__user-menu__'): boolean {
    return treeData.value.some((node) => node.id === id)
  }

  function getReservedRootGroupTemplate(id: '__toolbar__' | '__user-menu__'): NavNode {
    const template = demoNavRoot.children.find((node) => node.id === id)
    if (template) {
      return deepClone(template)
    }
    if (id === '__toolbar__') {
      return {
        id: '__toolbar__',
        type: 'group',
        nodeKind: 'system-directory',
        title: '工具栏',
        icon: 'SetUp',
        childPlacement: 'toolbar',
        children: [],
      }
    }
    return {
      id: '__user-menu__',
      type: 'group',
      nodeKind: 'system-directory',
      title: '用户菜单',
      icon: 'User',
      childPlacement: 'user-menu',
      children: [],
    }
  }

  async function restoreReservedRootGroup(id: '__toolbar__' | '__user-menu__') {
    if (hasReservedRootGroup(id)) {
      addStatus(`${id} 已存在，无需恢复`, 'info')
      return
    }

    const node = getReservedRootGroupTemplate(id)
    treeData.value.unshift(node)

    try {
      await http.post(`${getNavApi()}/nodes`, { node, index: 0 })
      addStatus(`已恢复 ${node.title}`, 'success')
    } catch (e) {
      treeData.value = treeData.value.filter((n) => n.id !== id)
      addStatus(`恢复失败: ${String(e)}`, 'error')
    }
  }

  function addChildNode(parent: NavNode) {
    const id = `page-${Date.now()}`
    const node: NavNode = {
      id,
      type: 'item',
      nodeKind: 'page',
      title: '新页面',
      icon: defaultIconByKind('page'),
      path: `/${id}`,
    }
    ;(parent.children ??= []).push(node)
    void http.post(`${getNavApi()}/nodes`, { parentId: parent.id, node }).then(
      () => addStatus(`已在 ${parent.title} 下添加子节点`, 'info'),
      (e: unknown) => addStatus(`添加节点失败: ${String(e)}`, 'error'),
    )
  }

  function removeNodeFromTree(node: { parent: { data: NavNode } }, data: NavNode) {
    if (isSystemRootDirectory(data)) {
      addStatus(`系统目录 ${data.title} 不可删除，仅可编辑子项`, 'warning')
      return
    }
    const isRootReserved = SYSTEM_ROOT_DIRECTORY_IDS.has(data.id)
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
      () => addStatus(
        isRootReserved
          ? `已删除 ${data.title}（可在更多菜单中恢复）`
          : `已删除 ${data.title}`,
        'info',
      ),
      (e: unknown) => addStatus(`删除节点失败: ${String(e)}`, 'error'),
    )
  }

  function resetToDemo() {
    treeData.value = deepClone(demoNavRoot.children)
    navEmpty.value = false
    selectedNode.value = null
    navDirty.value = false
    clearFiles()
    addStatus('已重置为演示数据', 'info')
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
      await saveNodeChanges()
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
    linkProbeLoading,
    linkProbeInfo,
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
    onExternalUrlChanged,
    probeLinkRenderMode,
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
    handleNodeKindChange,
    addRootNode,
    hasReservedRootGroup,
    isSystemRootDirectory,
    restoreReservedRootGroup,
    canUseModuleNodeKind,
    addChildNode,
    removeNodeFromTree,
    resetToDemo,
    initSeedNavigation,
    toggleContext,
    addContextItem,
    removeContextItem,
    createPage,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
