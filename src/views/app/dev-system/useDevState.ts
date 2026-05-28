/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心。
 *
 * 编辑能力是普通业务能力，只负责 DevSystem 的页面配置编辑。
 *
 * SSOT 设计：
 * - 页面 4 文件（rule / pagedata / script / style）的真源由 PageEditor 持有。
 * - Vue 层只通过 PageEditor adapter 方法读取文本、状态、dirty、undo/redo 和工具模型。
 * - 导航树、节点表单、autoSave、版本 API 与页面 4 文件状态合一暴露。
 *
 * 后端由 PageEditor 统一聚合；adapter 保留 UI 响应式映射、localStorage、
 * autoSave、refreshRoutes、demoNavRoot fallback 和状态消息。
 */
import { ref, reactive, computed, getCurrentInstance, nextTick } from 'vue'
import { refreshRoutes } from '@spark-view/spark-app'
import type { LinkTarget, NavNode, NavNodeKind, NavPermissionMode } from '@spark-view/spark-app'
import { useSparkComponent } from '@spark-view/spark-component'
import {
  createPageEditor,
} from '@spark-view/spark-page-config/editor'
import { demoNavRoot } from '@/layout/demo-nav'
import {
  runPageDesignAiSession,
  type PageDesignAiRunOptions,
} from '@/services/page-design-ai-runner'

export const PAGE_CONFIG_FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
export type PageConfigFileName = typeof PAGE_CONFIG_FILE_NAMES[number]
export type PageConfigFileVersionSummary = {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}
export type PageConfigPageSummary = Record<string, unknown> & {
  pageId: string
  pageType?: string
  files?: PageConfigFileName[]
}
export type NavigationNodeDraft = {
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
  permissionMode: NavPermissionMode
}

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export type StatusMessage = {
  text: string
  type: 'success' | 'warning' | 'error' | 'info'
  time: string}

export type DevContextConfig = {
  placeholder: string
  defaultValue: string
  paramName: string}

export type DevWorkspaceTab = 'props' | 'preview' | PageConfigFileName

export type RunPageDesignAiOptions = PageDesignAiRunOptions

import { getPageApi, getNavApi } from '@/services/api-paths'
import { createAuthHeaders, http } from '@/services/http'

type NavNodeLocation = {
  node: NavNode
  parent: NavNode | null
  parentId: string | null
  index: number
}

function normalizePageIdFromPath(path: string | undefined | null): string {
  return path ? path.replace(/^\/+/, '').trim() : ''
}

function isConfigNodeKind(nodeKind: NavNodeKind): boolean {
  return nodeKind === 'page' || nodeKind === 'sub-page'
}

function isPageLikeKind(kind: NavNodeKind): boolean {
  return kind === 'page'
    || kind === 'system-page'
    || kind === 'system-action'
    || kind === 'link'
    || kind === 'sub-page'
}

function findNodeById(nodes: readonly NavNode[], targetId: string): NavNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node
    const children = node.children
    if (Array.isArray(children)) {
      const found = findNodeById(children, targetId)
      if (found !== null) return found
    }
  }
  return null
}

function findParentNodeById(nodes: readonly NavNode[], targetId: string, parent: NavNode | null = null): NavNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent
    const children = node.children
    if (Array.isArray(children)) {
      const found = findParentNodeById(children, targetId, node)
      if (found !== null) return found
    }
  }
  return null
}

function findNodeLocation(nodes: readonly NavNode[], targetId: string, parent: NavNode | null = null): NavNodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node === undefined) continue
    if (node.id === targetId) return { node, parent, parentId: parent?.id ?? null, index }
    const children = node.children
    if (Array.isArray(children)) {
      const found = findNodeLocation(children, targetId, node)
      if (found !== null) return found
    }
  }
  return null
}

function findConfigNodeByPageId(nodes: readonly NavNode[], pageId: string): NavNode | null {
  for (const node of nodes) {
    if (isConfigNodeKind(node.nodeKind ?? 'page') && normalizePageIdFromPath(node.path) === pageId) {
      return node
    }
    const children = node.children
    if (Array.isArray(children)) {
      const found = findConfigNodeByPageId(children, pageId)
      if (found !== null) return found
    }
  }
  return null
}

function isSystemRootDirectory(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
  return Boolean(node?.nodeKind === 'system-directory' && rootNodes.some(rootNode => rootNode.id === node.id))
}

function canUseModuleNodeKind(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
  if (!node) return true
  const parent = findParentNodeById(rootNodes, node.id)
  if (!parent) return true
  return !isPageLikeKind(parent.nodeKind ?? 'module')
}

function cloneNavNode(node: NavNode): NavNode {
  return JSON.parse(JSON.stringify(node)) as NavNode
}

function createReservedRootGroup(placement: 'toolbar' | 'user-menu', createId: () => string): NavNode {
  const template = demoNavRoot.children.find(node => node.childPlacement === placement)
  if (template !== undefined) {
    return { ...cloneNavNode(template), id: createId() }
  }
  return placement === 'toolbar'
    ? { id: createId(), nodeKind: 'system-directory', title: '工具栏', icon: 'SetUp', childPlacement: 'toolbar', children: [] }
    : { id: createId(), nodeKind: 'system-directory', title: '用户菜单', icon: 'User', childPlacement: 'user-menu', children: [] }
}

// ═══════════════════════════════════════════════════════════
// 共享状态工厂
// ═══════════════════════════════════════════════════════════

export function useDevState() {
  const editor = createPageEditor({
    http,
    getPageConfigApi: getPageApi,
    getNavigationApi: getNavApi,
    getHeaders: createAuthHeaders,
  })
  const capabilityConsumer = getCurrentInstance() === null
    ? null
    : useSparkComponent({ type: 'dev-system-ai-runner' }).sparkConsume

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
  const navDraftRevision = ref(0)
  const pageFilesRevision = ref(editor.revision)

  editor.subscribe(() => {
    pageFilesRevision.value = editor.revision
  })

  function getEditorActivePage(): ReturnType<typeof editor.getActivePage> {
    // navDraft proxies a framework-free PageEditor model. Track only explicit
    // navigation draft switches here; tying it to every editor revision creates
    // needless tab/render feedback in Vue.
    void navDraftRevision.value
    return editor.getActivePage()
  }

  function refreshNavDraftBindings(): void {
    navDraftRevision.value++
  }

  // ── 节点编辑表单（navDraft：直接代理到 activePage.navigation）──
  const navDraft = reactive({
    get id(): string { return getEditorActivePage()?.navigation.id ?? '' },
    set id(v: string) { const p = getActivePage(); if (p) { p.navigation.id = v; markNavDirty() } },
    get title(): string { return getEditorActivePage()?.navigation.title ?? '' },
    set title(v: string) { const p = getActivePage(); if (p) { p.navigation.title = v; markNavDirty() } },
    get icon(): string { return getEditorActivePage()?.navigation.icon ?? '' },
    set icon(v: string) { const p = getActivePage(); if (p) { p.navigation.icon = v; markNavDirty() } },
    get nodeKind(): NavNodeKind { return getEditorActivePage()?.navigation.nodeKind ?? 'page' },
    set nodeKind(v: NavNodeKind) { const p = getActivePage(); if (p) { p.navigation.nodeKind = v; markNavDirty() } },
    get dividerAfter(): boolean { return getEditorActivePage()?.navigation.dividerAfter ?? false },
    set dividerAfter(v: boolean) { const p = getActivePage(); if (p) { p.navigation.dividerAfter = v; markNavDirty() } },
    get description(): string { return getEditorActivePage()?.navigation.description ?? '' },
    set description(v: string) { const p = getActivePage(); if (p) { p.navigation.description = v; markNavDirty() } },
    get path(): string { return getEditorActivePage()?.navigation.path ?? '' },
    set path(v: string) { const p = getActivePage(); if (p) { p.navigation.path = v; markNavDirty() } },
    get redirect(): string { return getEditorActivePage()?.navigation.redirect ?? '' },
    set redirect(v: string) { const p = getActivePage(); if (p) { p.navigation.redirect = v; markNavDirty() } },
    get linkTarget(): LinkTarget { return getEditorActivePage()?.navigation.linkTarget ?? 'iframe' },
    set linkTarget(v: LinkTarget) { const p = getActivePage(); if (p) { p.navigation.linkTarget = v; markNavDirty() } },
    get parentPageId(): string { return getEditorActivePage()?.navigation.parentPageId ?? '' },
    set parentPageId(v: string) { const p = getActivePage(); if (p) { p.navigation.parentPageId = v; markNavDirty() } },
    get childPlacement(): string { return getEditorActivePage()?.navigation.childPlacement ?? '' },
    set childPlacement(v: string) { const p = getActivePage(); if (p) { p.navigation.childPlacement = v; markNavDirty() } },
    get order(): number { return getEditorActivePage()?.navigation.order ?? 0 },
    set order(v: number) { const p = getActivePage(); if (p) { p.navigation.order = v; markNavDirty() } },
    get hidden(): boolean { return getEditorActivePage()?.navigation.hidden ?? false },
    set hidden(v: boolean) { const p = getActivePage(); if (p) { p.navigation.hidden = v; markNavDirty() } },
    get disabled(): boolean { return getEditorActivePage()?.navigation.disabled ?? false },
    set disabled(v: boolean) { const p = getActivePage(); if (p) { p.navigation.disabled = v; markNavDirty() } },
    get refId(): string { return getEditorActivePage()?.navigation.refId ?? '' },
    set refId(v: string) { const p = getActivePage(); if (p) { p.navigation.refId = v; markNavDirty() } },
    get permissionMode(): 'none' | 'masked' | 'invisible' { return getEditorActivePage()?.navigation.permissionMode ?? 'masked' },
    set permissionMode(v: 'none' | 'masked' | 'invisible') { const p = getActivePage(); if (p) { p.navigation.permissionMode = v; markNavDirty() } },
    get hasContext(): boolean { return getEditorActivePage()?.navigation.hasContext ?? false },
    set hasContext(v: boolean) { const p = getActivePage(); if (p) { p.navigation.hasContext = v; markNavDirty() } },
  })
  /** 可变的上下文选项列表（v-model 需要可变数组元素；通过 setContextItems 同步到子模型）。 */
  const contextItems = ref<Array<{ id: string; title: string }>>([])
  const contextConfig = reactive<DevContextConfig>({
    placeholder: '', defaultValue: '', paramName: '',
  })

  // ── 页面文件状态（只经 PageEditor 访问）──
  const activePageId = ref('')
  const fileSaving = ref(false)

  function notifyPageFileChanged(pageId: string, filename: PageConfigFileName | '__created' | '__deleted' | '__bulk'): void {
    editor.notifyPageFileChanged(pageId, filename)
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

  // ── pageDesign AI ──
  const pageDesignAiRunning = ref(false)
  let pageDesignAiInFlight = false

  // ── 编辑器状态同步 ───────────────────────────────────

  function syncNavFromEditor(): void {
    const snap = editor.readSnapshot()
    treeData.value = [...snap.treeData]
    navDirty.value = snap.navigationDirty
    navEmpty.value = snap.treeData.length === 0
    if (snap.selectedNodeId && snap.selectedNode) {
      selectedNode.value = snap.selectedNode
    } else if (!snap.selectedNodeId) {
      selectedNode.value = null
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 计算属性
  // ═══════════════════════════════════════════════════════════

  function isDocumentDirty(name: PageConfigFileName): boolean {
    void pageFilesRevision.value
    const snap = editor.readSnapshot()
    return snap.dirtyFiles.has(name)
  }

  const hasAnyFileDirty = computed(() => PAGE_CONFIG_FILE_NAMES.some((n) => isDocumentDirty(n)))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)

  const pageDataDirty = computed(() => isDocumentDirty('pagedata.json'))
  const pageDataError = computed(() => null)

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

    const shouldReset = forceReset || activePageId.value !== normalizedPageId
    editor.setActivePage(normalizedPageId, { forceReset: shouldReset })
    activePageId.value = editor.readSnapshot().pageId
    persistActivePageId(normalizedPageId)
    refreshNavDraftBindings()
    return true
  }

  function clearFiles(): void {
    editor.clearActivePage()
    activePageId.value = ''
    persistActivePageId('')
    refreshNavDraftBindings()
  }

  // ═══════════════════════════════════════════════════════════
  // 导航树工具
  // ═══════════════════════════════════════════════════════════

  function isSystemRootDirectoryInTree(node: NavNode | null | undefined): boolean {
    return isSystemRootDirectory(node, treeData.value)
  }

  function canUseModuleNodeKindInTree(node: NavNode | null | undefined): boolean {
    return canUseModuleNodeKind(node, treeData.value)
  }

  function getNavDraft(): NavigationNodeDraft | null {
    return getActivePage()?.navigation.toDraft() ?? null
  }

  function syncActivePageContextByPath(path: string): void {
    const pageId = normalizePageIdFromPath(path)
    if (pageId && isConfigNodeKind(navDraft.nodeKind)) {
      setActivePageContext(pageId, activePageId.value !== pageId)
      return
    }
    clearFiles()
  }

  function applyNodeKindPreset(kind: NavNodeKind): void {
    const page = getActivePage()
    if (page) {
      page.navigation.applyKindPreset(kind)
    }
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

  function compactAiStatus(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
  }

  async function runPageDesignAi(options: RunPageDesignAiOptions): Promise<void> {
    const pageId = activePageId.value.trim()
    const userRequirement = options.userRequirement.trim()
    if (!pageId) {
      addStatus('请先选择一个配置页面', 'warning')
      return
    }
    if (!userRequirement) {
      addStatus('请先输入 AI 编辑需求', 'warning')
      return
    }
    if (pageDesignAiInFlight) return

    pageDesignAiInFlight = true
    await nextTick()
    pageDesignAiRunning.value = true
    let lastStreamStatusAt = 0

    try {
      addStatus(`AI 开始编辑页面 ${pageId}`, 'info')
      const result = await runPageDesignAiSession({
        ...options,
        pageId,
        editor,
        consumeCapability: capabilityConsumer,
        events: {
          onReasoning: (reasoning) => {
            const message = compactAiStatus(reasoning)
            if (!message) return
            const now = Date.now()
            if (now - lastStreamStatusAt < 1200) return
            lastStreamStatusAt = now
            addStatus(`AI 推理：${message}`, 'info')
          },
          onDelta: (delta) => {
            const message = compactAiStatus(delta)
            if (!message) return
            const now = Date.now()
            if (now - lastStreamStatusAt < 1200) return
            lastStreamStatusAt = now
            addStatus(`AI 回复：${message}`, 'info')
          },
          onToolCall: (record) => {
            syncNavFromEditor()
            const type: StatusMessage['type'] = record.status === 'success' ? 'info' : 'warning'
            addStatus(`AI 工具 ${record.toolName} ${record.status === 'success' ? '完成' : '失败'}`, type)
          },
          onStreamEvent: () => {
            pageFilesRevision.value = editor.revision
          },
        },
      })

      syncNavFromEditor()
      pageFilesRevision.value = editor.revision
      addStatus(
        result.sawToolCall
          ? `AI 已修改页面 ${pageId}，请保存`
          : `AI 已完成页面 ${pageId} 的编辑会话`,
        result.sawToolCall ? 'success' : 'info',
      )
    } catch (error) {
      addStatus(`AI 编辑失败: ${String(error)}`, 'error')
    } finally {
      pageDesignAiInFlight = false
      pageDesignAiRunning.value = false
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
      await editor.loadNavigation()
      syncNavFromEditor()
      addStatus('导航配置已加载', 'success')
    } catch {
      editor.replaceNavigationRoot(demoNavRoot)
      syncNavFromEditor()
      addStatus('导航加载失败，使用演示数据', 'warning')
    } finally {
      navLoading.value = false
    }

    if (preservedSelectedNodeId) {
      const matchedNode = findNodeById(treeData.value, preservedSelectedNodeId)
      if (matchedNode) {
        selectedNode.value = matchedNode
        loadNodeToForm(matchedNode)
        await syncPageFilesForNodeAfterLoad(matchedNode, false)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = findConfigNodeByPageId(treeData.value, preservedActivePageId)
      if (matchedNode) {
        selectedNode.value = matchedNode
        loadNodeToForm(matchedNode)
        await syncPageFilesForNodeAfterLoad(matchedNode, false)
        return
      }

      if (setActivePageContext(preservedActivePageId, false)) {
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
      await syncPageFilesForNodeAfterLoad(firstNode, false)
    }
  }

  async function syncPageFilesForNodeAfterLoad(node: NavNode, forceReload: boolean): Promise<void> {
    editor.selectNode(node.id)
    const pageId = normalizePageIdFromPath(node.path)
    if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
      setActivePageContext(pageId, forceReload || activePageId.value !== pageId)
      try {
        await editor.ensureActivePageFilesLoaded({ forceReload, allowMissingAsEmpty: true })
      } catch {
        // 文件加载失败不阻塞
      }
      return
    }
    clearFiles()
  }

  async function loadPages(): Promise<void> {
    try {
      pageList.value = await editor.listPages()
    } catch { /* ignore */ }
  }

  function syncEditorActivePageFromState(): boolean {
    const pageId = activePageId.value
    if (!pageId) return false
    if (editor.getActivePage()?.pageId !== pageId) {
      editor.setActivePage(pageId)
    }
    return true
  }

  async function ensureActivePageFilesLoaded(options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean }): Promise<void> {
    if (!syncEditorActivePageFromState()) return
    const loadOptions: { forceReload?: boolean; allowMissingAsEmpty?: boolean } = {
      allowMissingAsEmpty: options?.allowMissingAsEmpty ?? true,
    }
    if (options?.forceReload !== undefined) loadOptions.forceReload = options.forceReload
    await editor.ensureActivePageFilesLoaded(loadOptions)
  }

  async function loadPageFile(name: PageConfigFileName, options?: { forceReload?: boolean }): Promise<void> {
    if (!syncEditorActivePageFromState()) return
    await editor.loadPageFile(name, options)
  }

  function getPageFileText(name: PageConfigFileName): string {
    void pageFilesRevision.value
    return editor.getPageFileText(name)
  }

  // ═══════════════════════════════════════════════════════════
  // 后端版本 API
  // ═══════════════════════════════════════════════════════════

  async function listRemotePageVersions(filename: PageConfigFileName): Promise<PageConfigFileVersionSummary[]> {
    if (!activePageId.value) return []
    editor.setActivePage(activePageId.value)
    try {
      return await editor.listRemotePageVersions(filename)
    } catch (e) {
      addStatus(`读取后端版本失败: ${String(e)}`, 'error')
      return []
    }
  }

  async function restoreRemotePageVersion(version: number, filename: PageConfigFileName): Promise<boolean> {
    const pageId = activePageId.value
    if (!pageId) return false
    editor.setActivePage(pageId)
    try {
      await editor.restoreRemotePageVersion(version, filename)
      addStatus(`页面 ${pageId} 已将 ${filename} 版本 v${version} 恢复为当前版`, 'success')
      return true
    } catch (e) {
      addStatus(`恢复版本失败: ${String(e)}`, 'error')
      return false
    }
  }

  async function createRemotePageVersion(filename: PageConfigFileName): Promise<boolean> {
    if (!activePageId.value) return false
    editor.setActivePage(activePageId.value)
    try {
      await editor.createRemotePageVersion(filename)
      addStatus(`${filename} 已创建新版本快照`, 'success')
      return true
    } catch (e) {
      addStatus(`创建版本快照失败: ${String(e)}`, 'error')
      return false
    }
  }

  async function deleteRemotePageVersion(version: number, filename: PageConfigFileName): Promise<boolean> {
    if (!activePageId.value) return false
    editor.setActivePage(activePageId.value)
    try {
      await editor.deleteRemotePageVersion(version, filename)
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
    const pageId = normalizePageIdFromPath(node.path) || node.id || `nav-node-${node.id}`
    editor.setActivePage(pageId)
    const page = editor.getActivePage()
    if (page) {
      page.navigation.loadFromNode(node)
      contextItems.value = [...page.navigation.contextItems]
      Object.assign(contextConfig, page.navigation.contextConfig)
    }
    navDirty.value = false
    linkProbeInfo.value = null
    refreshNavDraftBindings()
  }

  function applyNavChanges(): void {
    if (!selectedNode.value) return
    const node = selectedNode.value
    if (isSystemRootDirectoryInTree(node)) {
      loadNodeToForm(node)
      navDirty.value = false
      addStatus(`系统目录 ${node.title} 不可修改目录属性，仅可编辑子项`, 'warning')
      return
    }

    if (navDraft.nodeKind === 'module' && !canUseModuleNodeKindInTree(node)) {
      applyNodeKindPreset('page')
      addStatus('页面下不能创建模块，已自动改为普通页面', 'warning')
    }

    const page = getActivePage()
    if (page) {
      page.navigation.setContextItems(contextItems.value)
      page.navigation.setContextConfig({ ...contextConfig })
      const result = page.navigation.applyToNode()
      for (const warning of result.warnings) {
        addStatus(warning, 'warning')
      }
    }
    navDirty.value = false
  }

  function markNavDirty(): void {
    navDirty.value = true
    const page = getActivePage()
    if (page) page.navigation.markDirty()
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
    if (isSystemRootDirectoryInTree(selectedNode.value)) { autoSaveStatus.value = 'idle'; return }

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
    try {
      await editor.saveNavigationRoot()
      syncNavFromEditor()
      await refreshRoutes()
      addStatus('导航配置已保存', 'success')
    } catch (e) {
      addStatus(`导航保存失败: ${String(e)}`, 'error')
    } finally {
      navSaving.value = false
    }
  }

  async function saveNodeChanges(): Promise<boolean> {
    applyNavChanges()
    if (!selectedNode.value) return false
    const node = selectedNode.value
    if (isSystemRootDirectoryInTree(node)) {
      navDirty.value = false
      addStatus(`系统目录 ${node.title} 仅允许编辑子项，跳过节点保存`, 'warning')
      return true
    }

    navSaving.value = true
    try {
      editor.selectNode(node.id)
      await editor.saveSelectedNavigationNode()
      syncNavFromEditor()
      await refreshRoutes()
      addStatus(`节点 ${node.title} 已保存`, 'success')
      return true
    } catch (e) {
      addStatus(`节点保存失败: ${String(e)}`, 'error')
      return false
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

  async function savePageFile(name: PageConfigFileName): Promise<void> {
    const pageId = activePageId.value
    if (!pageId) return

    fileSaving.value = true
    try {
      editor.setActivePage(pageId)
      await editor.savePageFile(name)
      addStatus(`页面 ${pageId} 已保存 ${name}`, 'success')
      await loadPages()
    } catch (e) {
      addStatus(`保存 ${name} 失败: ${String(e)}`, 'error')
    } finally {
      fileSaving.value = false
    }
  }

  async function createPageForSelectedNode(params: { pageId: string; title: string; icon: string }): Promise<boolean> {
    const pageId = params.pageId.trim()
    if (!pageId || !selectedNode.value) return false

    fileSaving.value = true
    try {
      await editor.createPageForSelectedNode({
        pageId,
        title: params.title,
        icon: params.icon,
      })
      await loadPages()

      navDraft.path = `/${pageId}`
      navDraft.title = params.title
      navDraft.icon = params.icon
      handlePathChange(`/${pageId}`)

      notifyPageFileChanged(pageId, '__created')
      setActivePageContext(pageId, false)
      await ensureActivePageFilesLoaded()
      return true
    } catch (e) {
      addStatus(`创建页面失败: ${String(e)}`, 'error')
      return false
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
    for (const name of PAGE_CONFIG_FILE_NAMES) {
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
    editor.selectNode(node.id)
    try {
      const pageId = normalizePageIdFromPath(node.path)
      if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
        setActivePageContext(pageId, activePageId.value !== pageId)
        await ensureActivePageFilesLoaded()
      } else {
        clearFiles()
        // Still open a PageModel for navigation form binding
        const navPageId = pageId || node.id || `nav-node-${node.id}`
        editor.setActivePage(navPageId)
      }
      loadNodeToForm(node)
    } catch (error) {
      addStatus(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  function handlePathChange(val: string): void {
    markNavDirty()
    syncActivePageContextByPath(val)
  }

  function handleNodeKindChange(kind: NavNodeKind): void {
    if (kind === 'module' && !canUseModuleNodeKindInTree(selectedNode.value)) {
      addStatus('页面下不能创建模块', 'warning')
      const fallbackKind = selectedNode.value?.nodeKind ?? 'page'
      applyNodeKindPreset(fallbackKind)
      return
    }
    applyNodeKindPreset(kind)
    markNavDirty()
    syncActivePageContextByPath(navDraft.path)
  }

  // ═══════════════════════════════════════════════════════════
  // 链接探测
  // ═══════════════════════════════════════════════════════════

  function onLinkUrlChanged(): void {
    markNavDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkTarget(): Promise<void> {
    const url = navDraft.path.trim()
    if (!url) {
      addStatus('请先输入超链接地址', 'warning')
      return
    }

    linkProbeLoading.value = true
    try {
      const result = await editor.probeLink(url)
      const embeddable = result.embeddable
      const reason = result.reason

      navDraft.linkTarget = embeddable ? 'iframe' : 'new-tab'
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
    editor.addRootNode(() => crypto.randomUUID())
    syncNavFromEditor()
    void editor.saveNavigationRoot().then(
      () => {
        syncNavFromEditor()
        addStatus('已添加根模块', 'info')
      },
      (e: unknown) => {
        // 回滚：重新加载导航
        void editor.loadNavigation().then(() => syncNavFromEditor())
        addStatus(`添加模块失败: ${String(e)}`, 'error')
      },
    )
  }

  function hasReservedRootGroup(placement: 'toolbar' | 'user-menu'): boolean {
    return treeData.value.some((node) => node.childPlacement === placement)
  }

  function getReservedRootGroupTemplate(placement: 'toolbar' | 'user-menu'): NavNode {
    return createReservedRootGroup(placement, () => crypto.randomUUID())
  }

  async function restoreReservedRootGroup(placement: 'toolbar' | 'user-menu'): Promise<void> {
    if (hasReservedRootGroup(placement)) {
      addStatus(`${placement} 已存在，无需恢复`, 'info')
      return
    }

    const node = getReservedRootGroupTemplate(placement)
    editor.restoreReservedRootGroup(placement, () => node.id)
    syncNavFromEditor()

    try {
      await editor.saveNavigationRoot()
      syncNavFromEditor()
      addStatus(`已恢复 ${node.title}`, 'success')
    } catch (e) {
      await editor.loadNavigation()
      syncNavFromEditor()
      addStatus(`恢复失败: ${String(e)}`, 'error')
    }
  }

  async function addChildNode(parent: NavNode): Promise<void> {
    const pageId = normalizePageIdFromPath(`/child-${crypto.randomUUID().slice(0, 8)}`)
    try {
      await editor.createMountedPage({
        pageId,
        parentId: parent.id,
        rollbackPageOnNavigationFailure: true,
      })
      syncNavFromEditor()
      await loadPages()
      await refreshRoutes()
      addStatus(`已在 ${parent.title} 下添加子节点`, 'info')
    } catch (e) {
      addStatus(`添加节点失败: ${String(e)}`, 'error')
    }
  }

  function removeNodeFromTree(_node: { parent: { data: NavNode } }, data: NavNode): void {
    if (isSystemRootDirectoryInTree(data)) {
      addStatus(`系统目录 ${data.title} 不可删除，仅可编辑子项`, 'warning')
      return
    }
    const pageId = normalizePageIdFromPath(data.path)
    const shouldRemoveMountedPage = pageId.length > 0 && isConfigNodeKind(data.nodeKind ?? 'page')
    const deletePromise = shouldRemoveMountedPage
      ? editor.removeMountedPage({ pageId, nodeId: data.id })
      : editor.deleteNode(data.id)
    void deletePromise.then(
      () => {
        if (selectedNode.value?.id === data.id) {
          selectedNode.value = null
          clearFiles()
        }
        if (shouldRemoveMountedPage) {
          notifyPageFileChanged(pageId, '__deleted')
          void loadPages()
        }
        syncNavFromEditor()
        addStatus(`已删除 ${data.title}`, 'info')
      },
      (e: unknown) => {
        syncNavFromEditor()
        addStatus(`删除节点失败: ${String(e)}`, 'error')
      },
    )
  }

  async function moveNodeInTree(data: NavNode): Promise<void> {
    if (isSystemRootDirectoryInTree(data)) return
    const location = findNodeLocation(treeData.value, data.id)
    if (!location) return
    navSaving.value = true
    try {
      await editor.moveMountedPage(data.id, location.parentId, location.index)
      syncNavFromEditor()
      await refreshRoutes()
      addStatus(`节点 ${data.title} 已移动`, 'success')
    } catch (e) {
      addStatus(`节点移动失败: ${String(e)}`, 'error')
      await loadNavConfig({ preserveSelectedNodeId: data.id, preserveActivePageId: activePageId.value })
    } finally {
      navSaving.value = false
    }
  }

  async function resetToDemo(): Promise<void> {
    editor.replaceNavigationRoot(demoNavRoot, { markDirty: true })
    syncNavFromEditor()
    selectedNode.value = null
    clearFiles()
    navSaving.value = true
    try {
      await editor.saveNavigationRoot()
      await refreshRoutes()
      syncNavFromEditor()
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
    const page = getActivePage()
    if (val && contextItems.value.length === 0) {
      contextItems.value.push({ id: '', title: '' })
    }
    if (page) {
      page.navigation.hasContext = val
      page.navigation.setContextItems(contextItems.value)
    }
    markNavDirty()
  }
  function addContextItem(): void {
    contextItems.value.push({ id: '', title: '' })
    const page = getActivePage()
    if (page) page.navigation.setContextItems(contextItems.value)
    markNavDirty()
  }
  function removeContextItem(idx: number): void {
    contextItems.value.splice(idx, 1)
    const page = getActivePage()
    if (page) page.navigation.setContextItems(contextItems.value)
    markNavDirty()
  }
  function fillDemoContext(): void {
    navDraft.hasContext = true
    contextItems.value = DEMO_CONTEXT_ITEMS.map(item => ({ ...item }))
    contextConfig.placeholder = DEMO_CONTEXT_CONFIG.placeholder
    contextConfig.defaultValue = DEMO_CONTEXT_CONFIG.defaultValue
    contextConfig.paramName = DEMO_CONTEXT_CONFIG.paramName
    const page = getActivePage()
    if (page) {
      page.navigation.setContextItems(contextItems.value)
      page.navigation.setContextConfig({ ...contextConfig })
    }
    markNavDirty()
    addStatus('已填充模块上下文演示数据', 'info')
  }

  /** context 字段变更时写穿到 page.navigation 并标记 dirty。 */
  function syncContextToNav(): void {
    const page = getActivePage()
    if (page) {
      page.navigation.setContextItems(contextItems.value)
      page.navigation.setContextConfig({ ...contextConfig })
    }
    markNavDirty()
  }

  // ═══════════════════════════════════════════════════════════
  // 工具访问（委托 PageEditor）
  // ═══════════════════════════════════════════════════════════

  function editDataSet(
    run: Parameters<typeof editor.editDataSet>[0],
  ): ReturnType<typeof editor.editDataSet> {
    return editor.editDataSet(run)
  }

  function getDataSetTool(): ReturnType<typeof editor.getDataSetTool> {
    void pageFilesRevision.value
    return editor.getDataSetTool()
  }

  function editNodeTree(
    run: Parameters<typeof editor.editNodeTree>[0],
  ): ReturnType<typeof editor.editNodeTree> {
    return editor.editNodeTree(run)
  }

  function getNodeTree(): ReturnType<typeof editor.getNodeTree> {
    void pageFilesRevision.value
    return editor.getNodeTree()
  }

  function getActivePage(): ReturnType<typeof editor.getActivePage> {
    return editor.getActivePage()
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

    // 编辑表单（navDraft 直接代理到 activePage.navigation）
    navDraft,
    contextItems,
    contextConfig,

    // 空导航状态
    navEmpty,

    // 页面 4 文件
    activePageId,
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
    pageDesignAiRunning,

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
    getPageFileText,
    getNavDraft,
    clearFiles,
    listRemotePageVersions,
    restoreRemotePageVersion,
    createRemotePageVersion,
    deleteRemotePageVersion,
    savePageFile,
    createPageForSelectedNode,
    onLinkUrlChanged,
    probeLinkTarget,
    selectPage,
    loadNodeToForm,
    markNavDirty,
    saveNavConfig,
    saveNodeChanges,
    saveAll,
    runPageDesignAi,
    selectNode,
    handlePathChange,
    handleNodeKindChange,
    addRootNode,
    hasReservedRootGroup,
    isSystemRootDirectory: isSystemRootDirectoryInTree,
    restoreReservedRootGroup,
    canUseModuleNodeKind: canUseModuleNodeKindInTree,
    addChildNode,
    removeNodeFromTree,
    moveNodeInTree,
    resetToDemo,
    toggleContext,
    addContextItem,
    removeContextItem,
    fillDemoContext,
    syncContextToNav,
    getDataSetTool,
    editDataSet,
    editNodeTree,
    getNodeTree,
    getActivePage,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
