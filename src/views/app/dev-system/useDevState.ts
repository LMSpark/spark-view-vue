/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心。
 *
 * SSOT 设计：
 * - 页面 4 文件（rule / pagedata / script / style）的真源是 `documents` 注册表。
 *   每个文件封装为 PageFileDocument，以域模型为真源、text 为派生投影，
 *   undo/redo 委托给 SparkNodeTree / DataSetCrudTool / SnapshotHistory<string>。
 * - 导航树、节点表单、autoSave、版本 API 与页面 4 文件注册表合一暴露。
 * - 页面模型 AI 编辑统一走 EditToolHost；该 host 从 documents 读写，
 *   保证手工编辑与 AI 编辑共享同一模型、同一 undo 链。
 */
import { ref, reactive, computed } from 'vue'
import type { LinkTarget, NavNode, AppNavRoot, NavContextItem, NavNodeKind } from '@spark-view/spark-app'
import { refreshRoutes } from '@spark-view/spark-app'
import type { EditToolHost } from './ai-bridge'
import { demoNavRoot } from '@/layout/demo-nav'
import {
  PAGE_FILE_NAMES,
  createPageDocuments,
  forEachDocument,
  isPageFileDocumentDirty,
  type PageDocumentRegistry,
  type PageFileName,
} from './page-file-documents'

export { PAGE_FILE_NAMES }
export type { PageFileName }
export type { PageFileDocument } from './page-file-documents'

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

export interface BackendPageVersionSummary {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}

export type DevWorkspaceTab = 'props' | 'preview' | PageFileName

import { getPageApi, getNavApi } from '@/services/api-paths'
import { http } from '@/services/http'

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// ═══════════════════════════════════════════════════════════
// 共享状态工厂
// ═══════════════════════════════════════════════════════════

export function useDevState() {
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

  const DEFAULT_ICON_BY_KIND: Record<NavNodeKind, string> = {
    'system-directory': 'FolderOpened',
    'module': 'FolderOpened',
    'system-page': 'Monitor',
    'system-action': 'Lightning',
    'page': 'Document',
    'link': 'Link',
    'sub-page': 'Document',
    'ref': 'Connection',
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
  const documents: PageDocumentRegistry = createPageDocuments()
  const fileSaving = ref(false)

  let activePageFilesLoadPromise: Promise<void> | null = null
  let activePageFilesLoadPageId = ''
  let activePageFilesLoadEpoch = 0

  function invalidateActivePageFilesLoad(): void {
    activePageFilesLoadPromise = null
    activePageFilesLoadPageId = ''
    activePageFilesLoadEpoch += 1
  }

  // ── 空导航状态 ──
  const navEmpty = ref(false)

  // ── 页面列表 ──
  const pageList = ref<Array<Record<string, unknown>>>([])

  // ── 状态消息 ──
  const statusMessages = ref<StatusMessage[]>([])
  const linkProbeLoading = ref(false)
  const linkProbeInfo = ref<{ embeddable: boolean; reason: string } | null>(null)

  // ── 自动保存 ──
  const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 800

  function isDocumentDirty(name: PageFileName): boolean {
    return isPageFileDocumentDirty(documents[name])
  }

  // ═══════════════════════════════════════════════════════════
  // 计算属性
  // ═══════════════════════════════════════════════════════════

  const hasAnyFileDirty = computed(() => PAGE_FILE_NAMES.some((n) => isDocumentDirty(n)))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)

  const pageDataDirty = computed(() => isDocumentDirty('pagedata.json'))
  const pageDataError = computed(() => documents['pagedata.json'].parseError.value)

  // ═══════════════════════════════════════════════════════════
  // Edit Tool Host（单例 per page）
  // ═══════════════════════════════════════════════════════════

  let toolHostPageId = ''
  let toolHost: EditToolHost | null = null

  function buildEditToolHost(): EditToolHost {
    const ruleDoc = documents['rule.json']
    const pageDataDoc = documents['pagedata.json']
    const scriptDoc = documents['script.js']
    const styleDoc = documents['style.css']

    return {
      getNodeTree: () => ruleDoc.model.value,
      onNodeTreeChanged(nodeTree) {
        ruleDoc.replaceModel(nodeTree)
      },
      getDataSetTool: () => pageDataDoc.model.value,
      onDataSetChanged(tool) {
        pageDataDoc.replaceModel(tool)
      },
      readScript: () => scriptDoc.text.value,
      writeScript(content) {
        scriptDoc.setText(content)
      },
      readStyle: () => styleDoc.text.value,
      writeStyle(content) {
        styleDoc.setText(content)
      },
    }
  }

  /**
  * 获取当前 pageId 对应的长寿单例 EditToolHost。
   * 同一 pageId 生命周期内返回同一实例；pageId 切换时自动换新。
   */
  function getEditToolHost(): EditToolHost {
    if (toolHost && toolHostPageId === activePageId.value) {
      return toolHost
    }
    toolHost = buildEditToolHost()
    toolHostPageId = activePageId.value
    return toolHost
  }

  function invalidateEditToolHost(): void {
    toolHost = null
    toolHostPageId = ''
  }

  // ═══════════════════════════════════════════════════════════
  // 工具：地址 / 持久化 pageId
  // ═══════════════════════════════════════════════════════════

  function normalizePageIdFromPath(path: string | undefined | null): string {
    return path ? path.replace(/^\/+/, '').trim() : ''
  }

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

  function isConfigNodeKind(nodeKind: NavNodeKind): boolean {
    return nodeKind === 'page' || nodeKind === 'sub-page'
  }

  function findConfigNodeByPageId(nodes: NavNode[], pageId: string): NavNode | null {
    for (const node of nodes) {
      if (isConfigNodeKind(node.nodeKind ?? 'page') && normalizePageIdFromPath(node.path) === pageId) {
        return node
      }
      if (Array.isArray(node.children)) {
        const found = findConfigNodeByPageId(node.children, pageId)
        if (found) return found
      }
    }
    return null
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = pageList.value.find((page) => String(page['pageId'] ?? '') === pageId)
    if (!pageMeta) return true
    return String(pageMeta['pageType'] ?? 'config') !== 'system-page'
  }

  // ═══════════════════════════════════════════════════════════
  // 页面上下文切换
  // ═══════════════════════════════════════════════════════════

  function resetAllDocuments(): void {
    forEachDocument(documents, (_name, doc) => doc.reset())
  }

  function setActivePageContext(pageId: string, forceReset = false): boolean {
    if (!pageId || !isBackendConfigPage(pageId)) {
      clearFiles()
      return false
    }

    const shouldReset = forceReset || activePageId.value !== pageId
    if (shouldReset) {
      invalidateActivePageFilesLoad()
      resetAllDocuments()
      invalidateEditToolHost()
    }

    activePageId.value = pageId
    persistActivePageId(pageId)
    return true
  }

  function clearFiles(): void {
    invalidateActivePageFilesLoad()
    activePageId.value = ''
    persistActivePageId('')
    resetAllDocuments()
    invalidateEditToolHost()
  }

  // ═══════════════════════════════════════════════════════════
  // 导航树工具
  // ═══════════════════════════════════════════════════════════

  function isSystemRootDirectory(node: NavNode | null | undefined): boolean {
    if (!node) return false
    if (node.nodeKind !== 'system-directory') return false
    return treeData.value.some((rootNode) => rootNode.id === node.id)
  }

  function isPageLikeKind(kind: NavNodeKind): boolean {
    return kind === 'page' || kind === 'system-page' || kind === 'system-action' || kind === 'link' || kind === 'sub-page'
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

  function findNodeById(nodes: NavNode[], targetId: string): NavNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return node
      if (Array.isArray(node.children)) {
        const found = findNodeById(node.children, targetId)
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
    return !isPageLikeKind(parent.nodeKind ?? 'module')
  }

  function defaultIconByKind(kind: NavNodeKind): string {
    return DEFAULT_ICON_BY_KIND[kind]
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

  function syncIconByNodeKind(nextKind: NavNodeKind, previousKind: NavNodeKind): void {
    const previousDefault = defaultIconByKind(previousKind)
    const nextDefault = defaultIconByKind(nextKind)
    if (!editForm.icon || editForm.icon === previousDefault) {
      editForm.icon = nextDefault
    }
  }

  function applyNodeKindToNode(node: NavNode, parentPlacement?: string): NavNode {
    const cloned = deepClone(node)
    if (cloned.nodeKind === undefined && (parentPlacement === 'toolbar' || parentPlacement === 'user-menu')) {
      cloned.nodeKind = 'system-action'
    }
    if (cloned.nodeKind === 'sub-page') {
      cloned.hidden = true
      delete cloned.path
      delete cloned.redirect
      delete cloned.linkTarget
    } else if (cloned.nodeKind === 'link') {
      delete cloned.redirect
      delete cloned.parentPageId
      if (cloned.linkTarget !== 'iframe' && cloned.linkTarget !== 'new-tab') {
        cloned.linkTarget = 'iframe'
      }
    } else {
      delete cloned.linkTarget
    }
    if (Array.isArray(cloned.children)) {
      cloned.children = cloned.children.map(child => applyNodeKindToNode(child, cloned.childPlacement))
    }
    return cloned
  }

  function applyNodeKindPreset(kind: NavNodeKind): void {
    const previousKind = editForm.nodeKind
    editForm.nodeKind = kind
    syncIconByNodeKind(kind, previousKind)

    if (kind === 'system-directory') {
      editForm.hidden = false
      editForm.path = ''
      editForm.redirect = ''
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'module') {
      editForm.hidden = false
      editForm.path = ''
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'system-page') {
      editForm.hidden = false
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'page') {
      editForm.hidden = false
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
      return
    }

    if (kind === 'link') {
      editForm.hidden = false
      editForm.path = ''
      editForm.redirect = ''
      editForm.parentPageId = ''
      editForm.refId = ''
      return
    }

    if (kind === 'ref') {
      editForm.hidden = false
      editForm.path = ''
      editForm.redirect = ''
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
      return
    }

    editForm.hidden = true
    editForm.path = ''
    editForm.redirect = ''
    editForm.linkTarget = 'iframe'
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

  function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
    return ROOT_CHILD_PLACEMENTS.has(String(value ?? '').trim())
      ? (value as 'header' | 'sidebar')
      : 'header'
  }

  function buildMigratedNavRoot(config: { title?: string; childPlacement?: string; children?: NavNode[]; homePath?: string }): AppNavRoot {
    const root: AppNavRoot = {
      title: config.title ?? '',
      childPlacement: normalizeRootChildPlacement(config.childPlacement),
      children: (config.children ?? []).map(node => applyNodeKindToNode(node)),
    }
    const homePath = typeof config.homePath === 'string' ? config.homePath.trim() : ''
    if (homePath) root.homePath = homePath
    return root
  }

  async function loadNavConfig(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }): Promise<void> {
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.id ?? null
    const preservedActivePageId = options?.preserveActivePageId?.trim() ?? ''
    navLoading.value = true
    try {
      const config = await http.get<{ childPlacement?: string; children?: NavNode[]; homePath?: string }>(getNavApi())
      const migratedRoot = buildMigratedNavRoot(config)
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
      treeData.value = deepClone(demoNavRoot.children).map(node => applyNodeKindToNode(node))
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
      pageList.value = await http.get<Array<Record<string, unknown>>>(`${getPageApi()}/__list`)
    } catch { /* ignore */ }
  }

  async function fetchRemotePageFileContent(pageId: string, name: PageFileName): Promise<string> {
    try {
      const data = await http.get<Record<string, unknown>>(`${getPageApi()}/${encodeURIComponent(pageId)}/${name}`)
      return typeof data['content'] === 'string' ? data['content'] : ''
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`读取页面文件失败: ${pageId}/${name} (${detail})`)
    }
  }

  function areAllActivePageFilesLoaded(): boolean {
    return PAGE_FILE_NAMES.every((entry) => documents[entry].loadState.value === 'loaded')
  }

  async function ensureActivePageFilesLoaded(options?: { forceReload?: boolean }): Promise<void> {
    const pageId = activePageId.value
    if (!pageId) return
    const forceReload = options?.forceReload === true
    const isFileDirty = (name: PageFileName) => isDocumentDirty(name)

    if (activePageFilesLoadPromise && activePageFilesLoadPageId === pageId) {
      return activePageFilesLoadPromise
    }

    if (!forceReload && areAllActivePageFilesLoaded()) return

    if (!forceReload && PAGE_FILE_NAMES.some((entry) => isFileDirty(entry))) {
      // Respect local dirty edits: mark any non-loading idle docs as loaded so UI progresses.
      for (const entry of PAGE_FILE_NAMES) {
        const doc = documents[entry]
        if (doc.loadState.value !== 'loading' && !isFileDirty(entry) && doc.loadState.value === 'idle') {
          // Leave idle empty docs as idle — only promote if they have any content.
          if (doc.text.value || doc.savedText.value) doc.loadState.value = 'loaded'
        }
      }
      return
    }

    const loadEpoch = activePageFilesLoadEpoch
    activePageFilesLoadPageId = pageId
    const previousLoadStates = new Map<PageFileName, 'idle' | 'loading' | 'loaded'>(
      PAGE_FILE_NAMES.map(entry => [entry, documents[entry].loadState.value]),
    )

    for (const entry of PAGE_FILE_NAMES) {
      const doc = documents[entry]
      if (!forceReload && isFileDirty(entry)) {
        doc.loadState.value = 'loaded'
        continue
      }
      doc.loadState.value = 'loading'
    }

    const loadPromise = (async () => {
      let loadedSnapshots: ReadonlyArray<readonly [PageFileName, string]>
      try {
        loadedSnapshots = await Promise.all(
          PAGE_FILE_NAMES.map(async (entry) => [entry, await fetchRemotePageFileContent(pageId, entry)] as const),
        )
      } catch (error) {
        if (activePageFilesLoadEpoch === loadEpoch && activePageId.value === pageId) {
          for (const entry of PAGE_FILE_NAMES) {
            documents[entry].loadState.value = previousLoadStates.get(entry) ?? 'idle'
          }
        }
        throw error
      }

      if (activePageFilesLoadEpoch !== loadEpoch || activePageId.value !== pageId) return

      for (const [entry, loadedText] of loadedSnapshots) {
        const doc = documents[entry]
        if (!forceReload && isFileDirty(entry)) {
          doc.loadState.value = 'loaded'
          continue
        }
        doc.loadFromText(loadedText, { markSaved: true })
      }
    })().finally(() => {
      if (activePageFilesLoadEpoch === loadEpoch && activePageFilesLoadPageId === pageId) {
        activePageFilesLoadPromise = null
        activePageFilesLoadPageId = ''
      }
    })

    activePageFilesLoadPromise = loadPromise
    return loadPromise
  }

  async function loadPageFile(name: PageFileName, options?: { forceReload?: boolean }): Promise<void> {
    void name
    await ensureActivePageFilesLoaded(options)
  }

  // ═══════════════════════════════════════════════════════════
  // 后端版本 API
  // ═══════════════════════════════════════════════════════════

  async function listRemotePageVersions(filename: PageFileName): Promise<BackendPageVersionSummary[]> {
    const pageId = activePageId.value
    if (!pageId) return []
    try {
      const result = await http.get<Array<Record<string, unknown>>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions`,
      )
      return result
        .map((item) => ({
          version: parseOptionalNumber(item['version']) ?? 0,
          createdAt: typeof item['createdAt'] === 'string' ? item['createdAt'] : '',
          isCurrent: Boolean(item['isCurrent']),
          modifiedBy: typeof item['modifiedBy'] === 'string' ? item['modifiedBy'] : null,
        }))
        .filter((item) => item.version > 0)
    } catch (e) {
      addStatus(`读取后端版本失败: ${String(e)}`, 'error')
      return []
    }
  }

  async function restoreRemotePageVersion(version: number, filename: PageFileName): Promise<boolean> {
    const pageId = activePageId.value
    if (!pageId) return false
    try {
      await http.post<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}/__restore`,
        {},
      )
      invalidateActivePageFilesLoad()
      documents[filename].reset()
      addStatus(`页面 ${pageId} 已将 ${filename} 版本 v${version} 恢复为当前版`, 'success')
      return true
    } catch (e) {
      addStatus(`恢复版本失败: ${String(e)}`, 'error')
      return false
    }
  }

  async function createRemotePageVersion(filename: PageFileName): Promise<boolean> {
    const pageId = activePageId.value
    if (!pageId) return false
    try {
      await http.post<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions`,
        {},
      )
      addStatus(`${filename} 已创建新版本快照`, 'success')
      return true
    } catch (e) {
      addStatus(`创建版本快照失败: ${String(e)}`, 'error')
      return false
    }
  }

  async function deleteRemotePageVersion(version: number, filename: PageFileName): Promise<boolean> {
    const pageId = activePageId.value
    if (!pageId) return false
    try {
      await http.delete(`${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}`)
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
    editForm.id = node.id
    editForm.title = node.title
    editForm.icon = node.icon ?? ''
    editForm.nodeKind = node.nodeKind ?? 'page'
    editForm.dividerAfter = node.dividerAfter ?? false
    editForm.description = node.description ?? ''
    editForm.path = node.path ?? ''
    editForm.redirect = node.redirect ?? ''
    editForm.linkTarget = node.linkTarget === 'new-tab' ? 'new-tab' : 'iframe'
    editForm.parentPageId = node.parentPageId ?? ''
    editForm.refId = node.refId ?? ''
    editForm.childPlacement = node.childPlacement ?? ''
    editForm.order = node.order ?? 0
    editForm.hidden = node.hidden ?? false
    editForm.disabled = node.disabled ?? false
    editForm.permissionMode = node.permissionMode ?? 'masked'

    if (!editForm.icon) editForm.icon = defaultIconByKind(editForm.nodeKind)

    if (node.context !== undefined) {
      hasContext.value = true
      if (Array.isArray(node.context)) {
        contextItems.value = node.context.map(i => ({ id: String(i.id), title: i.title }))
        contextConfig.placeholder = ''
        contextConfig.defaultValue = ''
        contextConfig.paramName = ''
      } else if (typeof node.context === 'object') {
        const cfg = node.context as {
          source?: unknown; placeholder?: string; defaultValue?: unknown; paramName?: string
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

    const patch: Record<string, unknown> = { id: editForm.id, title: editForm.title, nodeKind: editForm.nodeKind }

    if (editForm.nodeKind === 'sub-page') {
      editForm.hidden = true
      editForm.path = ''
      editForm.redirect = ''
      editForm.linkTarget = 'iframe'
    } else if (editForm.nodeKind === 'link') {
      editForm.redirect = ''
      editForm.parentPageId = ''
    } else if (editForm.nodeKind === 'ref') {
      editForm.path = ''
      editForm.redirect = ''
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
    } else if (editForm.nodeKind === 'system-page') {
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
    } else if (editForm.nodeKind === 'page') {
      editForm.linkTarget = 'iframe'
      editForm.parentPageId = ''
    }

    if (editForm.icon) patch['icon'] = editForm.icon
    if (editForm.dividerAfter) patch['dividerAfter'] = true
    if (editForm.description) patch['description'] = editForm.description
    if (editForm.path) patch['path'] = editForm.path
    if (editForm.redirect) patch['redirect'] = editForm.redirect
    if (editForm.nodeKind === 'link') patch['linkTarget'] = editForm.linkTarget
    if (editForm.nodeKind === 'ref' && editForm.refId) {
      if (editForm.refId === editForm.id) {
        addStatus('不能引用自身，已忽略 refId', 'warning')
      } else {
        patch['refId'] = editForm.refId
      }
    }
    if (editForm.parentPageId) patch['parentPageId'] = editForm.parentPageId
    if (editForm.childPlacement) patch['childPlacement'] = editForm.childPlacement
    if (editForm.order !== 0) patch['order'] = editForm.order
    if (editForm.hidden !== false) patch['hidden'] = editForm.hidden
    if (editForm.disabled !== false) patch['disabled'] = editForm.disabled
    patch['permissionMode'] = editForm.permissionMode

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

    const optKeys: Array<keyof NavNode> = [
      'icon', 'description', 'path', 'redirect', 'linkTarget',
      'parentPageId', 'childPlacement', 'order', 'hidden', 'disabled', 'context',
      'dividerAfter', 'nodeKind', 'refId', 'permissionMode',
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
    const root: AppNavRoot = { title: '', childPlacement: 'header', children: treeData.value }
    try {
      await http.put(getNavApi(), root)
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
      await http.put(`${getNavApi()}/nodes/${encodeURIComponent(node.id)}`, patch)
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
      const doc = documents[name]
      const content = doc.text.value

      await http.put<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${name}`,
        content,
        { headers: { 'Content-Type': 'text/plain' } },
      )

      doc.markSaved()
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
      const result = await http.post<Record<string, unknown>>(`${getNavApi()}/link-probe`, { url })
      const embeddable = Boolean(result['embeddable'])
      const reason = String(result['reason'] ?? '')

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
    const id = crypto.randomUUID()
    const node: NavNode = {
      id,
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

  function hasReservedRootGroup(placement: 'toolbar' | 'user-menu'): boolean {
    return treeData.value.some((node) => node.childPlacement === placement)
  }

  function getReservedRootGroupTemplate(placement: 'toolbar' | 'user-menu'): NavNode {
    const template = demoNavRoot.children.find((node) => node.childPlacement === placement)
    if (template) {
      const cloned = deepClone(template)
      cloned.id = crypto.randomUUID()
      return cloned
    }
    if (placement === 'toolbar') {
      return {
        id: crypto.randomUUID(),
        nodeKind: 'system-directory',
        title: '工具栏',
        icon: 'SetUp',
        childPlacement: 'toolbar',
        children: [],
      }
    }
    return {
      id: crypto.randomUUID(),
      nodeKind: 'system-directory',
      title: '用户菜单',
      icon: 'User',
      childPlacement: 'user-menu',
      children: [],
    }
  }

  async function restoreReservedRootGroup(placement: 'toolbar' | 'user-menu'): Promise<void> {
    if (hasReservedRootGroup(placement)) {
      addStatus(`${placement} 已存在，无需恢复`, 'info')
      return
    }

    const node = getReservedRootGroupTemplate(placement)
    treeData.value.unshift(node)

    try {
      await http.post(`${getNavApi()}/nodes`, { node, index: 0 })
      addStatus(`已恢复 ${node.title}`, 'success')
    } catch (e) {
      treeData.value = treeData.value.filter((n) => n.id !== node.id)
      addStatus(`恢复失败: ${String(e)}`, 'error')
    }
  }

  function addChildNode(parent: NavNode): void {
    const id = crypto.randomUUID()
    const node: NavNode = {
      id,
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

  function removeNodeFromTree(node: { parent: { data: NavNode } }, data: NavNode): void {
    if (isSystemRootDirectory(data)) {
      addStatus(`系统目录 ${data.title} 不可删除，仅可编辑子项`, 'warning')
      return
    }
    const isRootReserved = isSystemRootDirectory(data)
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

  function resetToDemo(): void {
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

  // ── 工具 ──
  function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) as T }

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

    // AI Tool Host
    getEditToolHost,

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
    resetToDemo,
    toggleContext,
    addContextItem,
    removeContextItem,
    fillDemoContext,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
