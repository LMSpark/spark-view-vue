/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心。
 *
 * 编辑能力是普通业务能力，不依赖 AI core；AI 只能在更外层复用这些 service 能力做会话编排。
 *
 * SSOT 设计：
 * - 页面 4 文件（rule / pagedata / script / style）的真源是 `documents` 注册表。
 *   每个文件封装为 PageFileDocument，以域模型为真源、text 为派生投影，
 *   undo/redo 委托给 SparkNodeTree / DataSetCrudTool / SnapshotHistory<string>。
 * - 导航树、节点表单、autoSave、版本 API 与页面 4 文件注册表合一暴露。
 */
import { ref, reactive, computed } from 'vue'
import { refreshRoutes } from '@spark-view/spark-app'
import {
  NavigationConfigClient,
  NavigationEditSession,
  PageConfigEditWorkspace,
  PageConfigFileApi,
  applyNavigationNodeDraftToNode,
  applyNodeKindPresetToDraft,
  buildNavRoot,
  canUseModuleNodeKind as canUseModuleNodeKindForTree,
  createChildPageNode,
  createConfigLoader,
  createNavigationNodeDraft,
  createReservedRootGroup,
  createRootModuleNode,
  findConfigNodeByPageId,
  findNodeById,
  findNodeLocation,
  PAGE_FILE_NAMES,
  forEachDocument,
  isConfigNodeKind,
  isSystemRootDirectory as isSystemRootDirectoryNode,
  normalizeNavRoot,
  normalizePageIdFromPath,
  type ConfigLoader,
  type LinkTarget,
  type NavNode,
  type NavNodeKind,
  type NavigationNodeDraft,
  type PageConfigPageSummary,
  type PageConfigFileVersionSummary,
  type PageFileName,
} from '@spark-view/spark-page-config'
import { demoNavRoot } from '@/layout/demo-nav'

export { PAGE_FILE_NAMES }
export type { PageFileName }
export type { PageConfigFileVersionSummary }
export type { PageFileDocument } from '@spark-view/spark-page-config'

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
  dividerAfter: boolean
  description: string
  path: string
  redirect: string
  linkTarget: LinkTarget
  parentPageId: string
  childPlacement: string
  order: number
  hidden: boolean
  disabled: boolean
  refId: string
  permissionMode: 'none' | 'masked' | 'invisible'
}

export interface DevContextConfig {
  placeholder: string
  defaultValue: string
  paramName: string
}

export type DevWorkspaceTab = 'props' | 'preview' | PageFileName

import { getPageApi, getNavApi } from '@/services/api-paths'
import { createAuthHeaders, http } from '@/services/http'

const pageFileApi = new PageConfigFileApi({ getPageConfigApi: getPageApi, http })
let pageConfigLoader: ConfigLoader | null = null
let pageConfigLoaderApiBaseUrl = ''

function getPageConfigLoader(): ConfigLoader {
  const apiBaseUrl = toPageConfigApiBaseUrl(getPageApi())
  if (pageConfigLoader === null || pageConfigLoaderApiBaseUrl !== apiBaseUrl) {
    pageConfigLoader = createConfigLoader({
      apiBaseUrl,
      fileStorage: 'localStorage',
      getHeaders: createAuthHeaders,
    })
    pageConfigLoaderApiBaseUrl = apiBaseUrl
  }
  return pageConfigLoader
}

function toPageConfigApiBaseUrl(pageApi: string): string {
  const normalized = pageApi.replace(/\/+$/, '')
  const suffix = '/pages-config'
  if (normalized.endsWith(suffix)) {
    return normalized.slice(0, -suffix.length) || '/'
  }
  return normalized || '/'
}

// ═══════════════════════════════════════════════════════════
// 共享状态工厂
// ═══════════════════════════════════════════════════════════

export function useDevState() {
  const navigationClient = new NavigationConfigClient({ getNavigationApi: getNavApi, http })
  const navigationSession = new NavigationEditSession()
  const pageWorkspace = new PageConfigEditWorkspace({
    fileApi: pageFileApi,
    getConfigLoader: getPageConfigLoader,
  })
  const DEMO_CONTEXT_ITEMS: Array<{ id: string; title: string }> = [
    { id: 'sales', title: '销售中心' },
    { id: 'ops', title: '运营中心' },
    { id: 'finance', title: '财务中心' },
  ]
  const DEMO_CONTEXT_CONFIG: DevContextConfig = {
    placeholder: '请选择模块上下文',
    defaultValue: 'sales',
    paramName: 'ctx',
  }

  // ── 导航树 ──
  const treeData = ref<NavNode[]>([])
  const navLoading = ref(false)
  const navSaving = ref(false)
  const navDirty = ref(false)
  const selectedNode = ref<NavNode | null>(null)

  // ── 节点编辑表单 ──
  const editForm = reactive<DevEditForm>({
    id: '', title: '', icon: '', nodeKind: 'page',
    dividerAfter: false,
    description: '',
    path: '', redirect: '', linkTarget: 'iframe' as LinkTarget,
    parentPageId: '', refId: '',
    childPlacement: '', order: 0,
    hidden: false, disabled: false,
    permissionMode: 'masked',
  })
  const hasContext = ref(false)
  const contextItems = ref<Array<{ id: string; title: string }>>([])
  const contextConfig = reactive<DevContextConfig>({
    placeholder: '', defaultValue: '', paramName: '',
  })

  // ── 页面文件 SSOT 注册表 ──
  const activePageId = ref('')
  const documents = pageWorkspace.documents
  const fileSaving = ref(false)
  const pageFilesRevision = ref(0)

  forEachDocument(documents, (_name, doc) => {
    doc.subscribe(() => {
      pageFilesRevision.value += 1
    })
  })

  function notifyPageFileChanged(pageId: string, filename: PageFileName | '__created' | '__deleted' | '__bulk'): void {
    pageWorkspace.notifyPageFileChanged(pageId, filename)
    if (pageId && pageId === activePageId.value) {
      pageFilesRevision.value += 1
    }
  }

  // ── 空导航状态 ──
  const navEmpty = ref(false)

  // ── 页面列表 ──
  const pageList = ref<PageConfigPageSummary[]>([])

  // ── 状态消息 ──
  const statusMessages = ref<StatusMessage[]>([])
  const linkProbeLoading = ref(false)
  const linkProbeInfo = ref<{ embeddable: boolean; reason: string } | null>(null)

  // ── 自动保存 ──
  const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 800

  function isDocumentDirty(name: PageFileName): boolean {
    void pageFilesRevision.value
    return pageWorkspace.isDocumentDirty(name)
  }

  // ═══════════════════════════════════════════════════════════
  // 计算属性
  // ═══════════════════════════════════════════════════════════

  const hasAnyFileDirty = computed(() => PAGE_FILE_NAMES.some((n) => isDocumentDirty(n)))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)

  const pageDataDirty = computed(() => isDocumentDirty('pagedata.json'))
  const pageDataError = computed(() => {
    void pageFilesRevision.value
    return documents['pagedata.json'].parseError.value
  })

  // ═══════════════════════════════════════════════════════════
  // 工具：地址 / 持久化 pageId
  // ═══════════════════════════════════════════════════════════

  function buildActivePageStorageKey(): string {
    if (typeof window === 'undefined') return 'dev-system:active-page'
    return `dev-system:active-page:${window.location.pathname}`
  }

  function readPersistedActivePageId(): string {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage.getItem(buildActivePageStorageKey())?.trim() ?? ''
    } catch {
      return ''
    }
  }

  function persistActivePageId(pageId: string): void {
    if (typeof window === 'undefined') return
    const key = buildActivePageStorageKey()
    try {
      if (pageId) window.localStorage.setItem(key, pageId)
      else window.localStorage.removeItem(key)
    } catch {
      // ignore storage failures
    }
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = pageList.value.find((page) => page.pageId === pageId)
    if (!pageMeta) return true
    return (pageMeta.pageType ?? 'config') !== 'system-page'
  }

  // ═══════════════════════════════════════════════════════════
  // 页面上下文切换
  // ═══════════════════════════════════════════════════════════

  function setActivePageContext(pageId: string, forceReset = false): boolean {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId || !isBackendConfigPage(normalizedPageId)) {
      clearFiles()
      return false
    }

    pageWorkspace.setActivePage(normalizedPageId, forceReset || activePageId.value !== normalizedPageId)
    activePageId.value = pageWorkspace.activePageId
    persistActivePageId(activePageId.value)
    return true
  }

  function clearFiles(): void {
    pageWorkspace.clear()
    activePageId.value = ''
    persistActivePageId('')
  }

  // ═══════════════════════════════════════════════════════════
  // 导航树工具
  // ═══════════════════════════════════════════════════════════

  function isSystemRootDirectory(node: NavNode | null | undefined): boolean {
    return isSystemRootDirectoryNode(node, treeData.value)
  }

  function canUseModuleNodeKind(node: NavNode | null | undefined): boolean {
    return canUseModuleNodeKindForTree(node, treeData.value)
  }

  async function syncPageFilesForNode(node: NavNode, forceReload: boolean): Promise<void> {
    const pageId = normalizePageIdFromPath(node.path)
    if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
      setActivePageContext(pageId, forceReload || activePageId.value !== pageId)
      await ensureActivePageFilesLoaded({ forceReload })
      return
    }
    clearFiles()
  }

  function applyNodeKindPreset(kind: NavNodeKind): void {
    Object.assign(editForm, applyNodeKindPresetToDraft({ ...editForm } as NavigationNodeDraft, kind))
  }

  // ═══════════════════════════════════════════════════════════
  // 状态消息
  // ═══════════════════════════════════════════════════════════

  function addStatus(text: string, type: StatusMessage['type'] = 'info'): void {
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

  async function loadNavConfig(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }): Promise<void> {
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.id ?? null
    const preservedActivePageId = options?.preserveActivePageId?.trim() ?? ''
    navLoading.value = true
    try {
      const migratedRoot = await navigationClient.loadRoot()
      navigationSession.replaceRoot(migratedRoot)
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
      const fallbackRoot = normalizeNavRoot(demoNavRoot)
      navigationSession.replaceRoot(fallbackRoot)
      treeData.value = fallbackRoot.children
      navEmpty.value = false
      addStatus('导航加载失败，使用演示数据', 'warning')
    } finally {
      navLoading.value = false
    }

    if (preservedSelectedNodeId) {
      const matchedNode = findNodeById(treeData.value, preservedSelectedNodeId)
      if (matchedNode) {
        selectedNode.value = matchedNode
        loadNodeToForm(matchedNode)
        await syncPageFilesForNode(matchedNode, false)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = findConfigNodeByPageId(treeData.value, preservedActivePageId)
      if (matchedNode) {
        selectedNode.value = matchedNode
        loadNodeToForm(matchedNode)
        await syncPageFilesForNode(matchedNode, true)
        return
      }

      if (setActivePageContext(preservedActivePageId, true)) {
        selectedNode.value = null
        navDirty.value = false
        linkProbeInfo.value = null
        return
      }
    }

    if (treeData.value.length === 0) {
      selectedNode.value = null
      clearFiles()
      return
    }

    const firstNode = treeData.value[0]
    if (firstNode) {
      selectedNode.value = firstNode
      loadNodeToForm(firstNode)
      await syncPageFilesForNode(firstNode, true)
    }
  }

  async function loadPages(): Promise<void> {
    try {
      pageList.value = await pageWorkspace.listPages()
    } catch { /* ignore */ }
  }

  async function ensureActivePageFilesLoaded(options?: { forceReload?: boolean }): Promise<void> {
    if (!activePageId.value) return
    pageWorkspace.setActivePage(activePageId.value)
    await pageWorkspace.ensureActivePageFilesLoaded(options)
  }

  async function loadPageFile(name: PageFileName, options?: { forceReload?: boolean }): Promise<void> {
    pageWorkspace.setActivePage(activePageId.value)
    await pageWorkspace.loadPageFile(name, options)
  }

  // ═══════════════════════════════════════════════════════════
  // 后端版本 API
  // ═══════════════════════════════════════════════════════════

  async function listRemotePageVersions(filename: PageFileName): Promise<PageConfigFileVersionSummary[]> {
    if (!activePageId.value) return []
    pageWorkspace.setActivePage(activePageId.value)
    try {
      return await pageWorkspace.listRemotePageVersions(filename)
    } catch (e) {
      addStatus(`读取后端版本失败: ${String(e)}`, 'error')
      return []
    }
  }

  async function restoreRemotePageVersion(version: number, filename: PageFileName): Promise<boolean> {
    const pageId = activePageId.value
    if (!pageId) return false
    pageWorkspace.setActivePage(pageId)
    try {
      await pageWorkspace.restoreRemotePageVersion(version, filename)
      pageFilesRevision.value += 1
      addStatus(`页面 ${pageId} 已将 ${filename} 版本 v${version} 恢复为当前版`, 'success')
      return true
    } catch (e) {
      addStatus(`恢复版本失败: ${String(e)}`, 'error')
      return false
    }
  }

  async function createRemotePageVersion(filename: PageFileName): Promise<boolean> {
    if (!activePageId.value) return false
    pageWorkspace.setActivePage(activePageId.value)
    try {
      await pageWorkspace.createRemotePageVersion(filename)
      addStatus(`${filename} 已创建新版本快照`, 'success')
      return true
    } catch (e) {
      addStatus(`创建版本快照失败: ${String(e)}`, 'error')
      return false
    }
  }

  async function deleteRemotePageVersion(version: number, filename: PageFileName): Promise<boolean> {
    if (!activePageId.value) return false
    pageWorkspace.setActivePage(activePageId.value)
    try {
      await pageWorkspace.deleteRemotePageVersion(version, filename)
      addStatus(`${filename} 版本 v${version} 已删除`, 'success')
      return true
    } catch (e) {
      addStatus(`删除版本失败: ${String(e)}`, 'error')
      return false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点表单
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: NavNode): void {
    const nodeDraft = createNavigationNodeDraft(node)
    Object.assign(editForm, nodeDraft.draft)
    hasContext.value = nodeDraft.context.hasContext
    contextItems.value = nodeDraft.context.items
    Object.assign(contextConfig, nodeDraft.context.config)
    navDirty.value = false
    linkProbeInfo.value = null
  }

  function applyNavChanges(): void {
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

    const result = applyNavigationNodeDraftToNode(node, {
      draft: { ...editForm } as NavigationNodeDraft,
      context: {
        hasContext: hasContext.value,
        items: contextItems.value,
        config: { ...contextConfig },
      },
    })
    for (const warning of result.warnings) {
      addStatus(warning, 'warning')
    }
    navDirty.value = false
  }

  function markNavDirty(): void {
    navDirty.value = true
    scheduleAutoSave()
  }

  function scheduleAutoSave(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveStatus.value = 'pending'
    autoSaveTimer = setTimeout(() => { void doAutoSave() }, AUTO_SAVE_DELAY)
  }

  function cancelAutoSave(): void {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
    if (autoSaveStatus.value === 'pending') autoSaveStatus.value = 'idle'
  }

  async function doAutoSave(): Promise<void> {
    autoSaveTimer = null
    if (!navDirty.value) { autoSaveStatus.value = 'idle'; return }
    if (!selectedNode.value) { autoSaveStatus.value = 'idle'; return }
    if (isSystemRootDirectory(selectedNode.value)) { autoSaveStatus.value = 'idle'; return }

    autoSaveStatus.value = 'saving'
    try {
      await saveNodeChanges()
      autoSaveStatus.value = 'saved'
      setTimeout(() => {
        if (autoSaveStatus.value === 'saved') autoSaveStatus.value = 'idle'
      }, 2000)
    } catch {
      autoSaveStatus.value = 'error'
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 保存
  // ═══════════════════════════════════════════════════════════

  async function saveNavConfig(): Promise<void> {
    if (navDirty.value) applyNavChanges()
    navSaving.value = true
    const root = buildNavRoot(treeData.value)
    try {
      await navigationClient.saveRoot(root)
      await refreshRoutes()
      navDirty.value = false
      addStatus('导航配置已保存', 'success')
    } catch (e) {
      addStatus(`导航保存失败: ${String(e)}`, 'error')
    } finally {
      navSaving.value = false
    }
  }

  async function saveNodeChanges(): Promise<void> {
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
      await navigationClient.updateNode(node.id, patch)
      await refreshRoutes()
      navDirty.value = false
      addStatus(`节点 ${node.title} 已保存`, 'success')
    } catch (e) {
      addStatus(`节点保存失败: ${String(e)}`, 'error')
    } finally {
      navSaving.value = false
    }
  }

  function selectPage(pageId: string): void {
    if (!isBackendConfigPage(pageId)) {
      clearFiles()
      addStatus(`页面 ${pageId} 为 vue-component，不提供后端配置文件编辑`, 'warning')
      return
    }
    setActivePageContext(pageId, activePageId.value !== pageId)
  }

  async function savePageFile(name: PageFileName): Promise<void> {
    const pageId = activePageId.value
    if (!pageId) return

    fileSaving.value = true
    try {
      pageWorkspace.setActivePage(pageId)
      await pageWorkspace.savePageFile(name)
      pageFilesRevision.value += 1
      addStatus(`页面 ${pageId} 已保存 ${name}`, 'success')
      await loadPages()
    } catch (e) {
      addStatus(`保存 ${name} 失败: ${String(e)}`, 'error')
    } finally {
      fileSaving.value = false
    }
  }

  async function saveCurrentNavScope(): Promise<void> {
    if (selectedNode.value) {
      await saveNodeChanges()
      return
    }
    await saveNavConfig()
  }

  async function saveAllDirtyPageFiles(): Promise<void> {
    for (const name of PAGE_FILE_NAMES) {
      if (isDocumentDirty(name)) await savePageFile(name)
    }
  }

  async function flushDirtyScopes(): Promise<void> {
    if (navDirty.value) await saveCurrentNavScope()
    if (hasAnyFileDirty.value) await saveAllDirtyPageFiles()
  }

  async function ensureCurrentNavScopePersistedWhenClean(): Promise<void> {
    if (!navDirty.value && !hasAnyFileDirty.value) {
      await saveCurrentNavScope()
    }
  }

  async function saveAll(): Promise<void> {
    await flushDirtyScopes()
    await ensureCurrentNavScopePersistedWhenClean()
  }

  // ═══════════════════════════════════════════════════════════
  // 节点选中
  // ═══════════════════════════════════════════════════════════

  async function selectNode(node: NavNode): Promise<void> {
    cancelAutoSave()
    if (navDirty.value && selectedNode.value) void saveNodeChanges()
    selectedNode.value = node
    loadNodeToForm(node)
    try {
      await syncPageFilesForNode(node, true)
    } catch (error) {
      addStatus(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  function syncActivePageContextByPath(path: string): void {
    const pageId = normalizePageIdFromPath(path)
    if (pageId && isConfigNodeKind(editForm.nodeKind)) {
      setActivePageContext(pageId, activePageId.value !== pageId)
      return
    }
    clearFiles()
  }

  function handlePathChange(val: string): void {
    markNavDirty()
    syncActivePageContextByPath(val)
  }

  function handleNodeKindChange(kind: NavNodeKind): void {
    if (kind === 'module' && !canUseModuleNodeKind(selectedNode.value)) {
      addStatus('页面下不能创建模块', 'warning')
      const fallbackKind = selectedNode.value?.nodeKind ?? 'page'
      applyNodeKindPreset(fallbackKind)
      return
    }
    applyNodeKindPreset(kind)
    markNavDirty()
    syncActivePageContextByPath(editForm.path)
  }

  // ═══════════════════════════════════════════════════════════
  // 链接探测
  // ═══════════════════════════════════════════════════════════

  function onLinkUrlChanged(): void {
    markNavDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkTarget(): Promise<void> {
    const url = editForm.path.trim()
    if (!url) {
      addStatus('请先输入超链接地址', 'warning')
      return
    }

    linkProbeLoading.value = true
    try {
      const result = await navigationClient.probeLink(url)
      const embeddable = result.embeddable
      const reason = result.reason

      editForm.linkTarget = embeddable ? 'iframe' : 'new-tab'
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
  // 树增删
  // ═══════════════════════════════════════════════════════════

  function addRootNode(): void {
    const node = createRootModuleNode(() => crypto.randomUUID())
    treeData.value.push(node)
    void navigationClient.addNode({ node }).then(
      () => {
        notifyPageFileChanged(node.id, '__created')
        addStatus('已添加根模块', 'info')
      },
      (e: unknown) => {
        treeData.value = treeData.value.filter((entry) => entry.id !== node.id)
        addStatus(`添加模块失败: ${String(e)}`, 'error')
      },
    )
  }

  function hasReservedRootGroup(placement: 'toolbar' | 'user-menu'): boolean {
    return treeData.value.some((node) => node.childPlacement === placement)
  }

  function getReservedRootGroupTemplate(placement: 'toolbar' | 'user-menu'): NavNode {
    return createReservedRootGroup(placement, {
      createId: () => crypto.randomUUID(),
      templateRoot: demoNavRoot,
    })
  }

  async function restoreReservedRootGroup(placement: 'toolbar' | 'user-menu'): Promise<void> {
    if (hasReservedRootGroup(placement)) {
      addStatus(`${placement} 已存在，无需恢复`, 'info')
      return
    }

    const node = getReservedRootGroupTemplate(placement)
    treeData.value.unshift(node)

    try {
      await navigationClient.addNode({ node, index: 0 })
      addStatus(`已恢复 ${node.title}`, 'success')
    } catch (e) {
      treeData.value = treeData.value.filter((n) => n.id !== node.id)
      addStatus(`恢复失败: ${String(e)}`, 'error')
    }
  }

  function addChildNode(parent: NavNode): void {
    const node = createChildPageNode(() => crypto.randomUUID())
    ;(parent.children ??= []).push(node)
    void navigationClient.addNode({ parentId: parent.id, node }).then(
      () => {
        notifyPageFileChanged(node.id, '__created')
        addStatus(`已在 ${parent.title} 下添加子节点`, 'info')
      },
      (e: unknown) => {
        parent.children = (parent.children ?? []).filter((entry) => entry.id !== node.id)
        addStatus(`添加节点失败: ${String(e)}`, 'error')
      },
    )
  }

  function removeNodeFromTree(node: { parent: { data: NavNode } }, data: NavNode): void {
    if (isSystemRootDirectory(data)) {
      addStatus(`系统目录 ${data.title} 不可删除，仅可编辑子项`, 'warning')
      return
    }
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
    void navigationClient.deleteNode(data.id).then(
      () => {
        if (data.path) {
          notifyPageFileChanged(data.path.replace(/^\/+/, ''), '__deleted')
        }
        addStatus(`已删除 ${data.title}`, 'info')
      },
      (e: unknown) => addStatus(`删除节点失败: ${String(e)}`, 'error'),
    )
  }

  async function moveNodeInTree(data: NavNode): Promise<void> {
    if (isSystemRootDirectory(data)) return
    const location = findNodeLocation(treeData.value, data.id)
    if (!location) return
    navSaving.value = true
    try {
      await navigationClient.moveNode(data.id, location.parentId, location.index)
      await refreshRoutes()
      navDirty.value = false
      addStatus(`节点 ${data.title} 已移动`, 'success')
    } catch (e) {
      addStatus(`节点移动失败: ${String(e)}`, 'error')
      await loadNavConfig({ preserveSelectedNodeId: data.id, preserveActivePageId: activePageId.value })
    } finally {
      navSaving.value = false
    }
  }

  async function resetToDemo(): Promise<void> {
    const demoRoot = normalizeNavRoot(demoNavRoot)
    treeData.value = demoRoot.children
    navigationSession.replaceRoot(demoRoot)
    navEmpty.value = false
    selectedNode.value = null
    clearFiles()
    navSaving.value = true
    try {
      await navigationClient.saveRoot(demoRoot)
      await refreshRoutes()
      navDirty.value = false
      addStatus('已重置为演示数据', 'info')
    } catch (e) {
      navDirty.value = true
      addStatus(`重置演示保存失败: ${String(e)}`, 'error')
    } finally {
      navSaving.value = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 上下文编辑
  // ═══════════════════════════════════════════════════════════

  function toggleContext(val: boolean): void {
    if (val && contextItems.value.length === 0) contextItems.value.push({ id: '', title: '' })
    markNavDirty()
  }
  function addContextItem(): void { contextItems.value.push({ id: '', title: '' }); markNavDirty() }
  function removeContextItem(idx: number): void { contextItems.value.splice(idx, 1); markNavDirty() }
  function fillDemoContext(): void {
    hasContext.value = true
    contextItems.value = DEMO_CONTEXT_ITEMS.map(item => ({ ...item }))
    contextConfig.placeholder = DEMO_CONTEXT_CONFIG.placeholder
    contextConfig.defaultValue = DEMO_CONTEXT_CONFIG.defaultValue
    contextConfig.paramName = DEMO_CONTEXT_CONFIG.paramName
    markNavDirty()
    addStatus('已填充模块上下文演示数据', 'info')
  }

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize(): Promise<void> {
    const persistedActivePageId = readPersistedActivePageId()
    await Promise.all([
      loadNavConfig({ preserveActivePageId: persistedActivePageId }),
      loadPages(),
    ])
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

    // 页面 4 文件
    activePageId,
    documents,
    fileSaving,
    pageFilesRevision,
    pageDataError,
    pageDataDirty,

    // 页面列表
    pageList,

    // 状态
    statusMessages,
    linkProbeLoading,
    linkProbeInfo,
    autoSaveStatus,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,
    isDocumentDirty,

    notifyPageFileChanged,

    // 方法
    addStatus,
    loadNavConfig,
    loadPages,
    loadPageFile,
    ensureActivePageFilesLoaded,
    clearFiles,
    listRemotePageVersions,
    restoreRemotePageVersion,
    createRemotePageVersion,
    deleteRemotePageVersion,
    savePageFile,
    onLinkUrlChanged,
    probeLinkTarget,
    selectPage,
    loadNodeToForm,
    markNavDirty,
    saveNavConfig,
    saveNodeChanges,
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
    moveNodeInTree,
    resetToDemo,
    toggleContext,
    addContextItem,
    removeContextItem,
    fillDemoContext,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
