/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心
 *
 * 设计原则：
 * - 站点树选中节点 → 驱动工作区所有面板
 * - AI 面板操作结果 → 自动刷新文件/树
 * - 统一 dirty 状态管理
 */
import { ref, reactive, computed, shallowRef } from 'vue'
import type { LinkTarget, NavNode, AppNavRoot, NavContextItem, NavNodeKind } from '@spark-view/spark-app'
import {
  commitDataSetSnapshot,
  formatPageDataSnapshot,
  getDataSetSnapshot,
  listDataSetSnapshots,
} from '@spark-view/spark-data'
import type { DataSet, DataSetHistorySnapshot } from '@spark-view/spark-data'
import { demoNavRoot } from '@/layout/demo-nav'
import { canonicalizePageDataJson, canonicalizePageDataValue } from './policies/pageDataJsonSchema'
import {
  canNavigatePageDataHistoryBack,
  canNavigatePageDataHistoryForward,
  getDraftTextForHistoryRestore,
  getPageDataHistoryBackTargetIndex,
  getPageDataHistoryForwardTarget,
} from './composables/pageDataHistoryNavigation'

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

export interface BackendPageVersionFile {
  pageId: string
  filename: PageFileName
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
  content: string
}

export const PAGE_FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
export type PageFileName = typeof PAGE_FILE_NAMES[number]
export type DevWorkspaceTab = 'props' | PageFileName

import { getPageApi, getNavApi } from '@/services/api-paths'
import { http } from '@/services/http'

function tryCanonicalizePageDataText(rawText: string): string {
  if (!rawText.trim()) return rawText

  try {
    return canonicalizePageDataJson(rawText).text
  } catch {
    return rawText
  }
}

type CanonicalPageData = ReturnType<typeof canonicalizePageDataValue>

function isPageFileName(value: string): value is PageFileName {
  return PAGE_FILE_NAMES.includes(value as PageFileName)
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// ═══════════════════════════════════════════════════════════
// 共享状态工厂 — 每个 DevSystem 实例一份
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

  // ── 页面配置文件 ──
  const activePageId = ref('')  // 当前正在编辑的页面 ID（独立于树节点）
  const editFiles = reactive<Record<string, string>>({
    'rule.json': '', 'pagedata.json': '', 'script.js': '', 'style.css': '',
  })
  const savedFiles = reactive<Record<string, string>>({
    'rule.json': '', 'pagedata.json': '', 'script.js': '', 'style.css': '',
  })
  const fileDirty = reactive<Record<string, boolean>>({
    'rule.json': false, 'pagedata.json': false, 'script.js': false, 'style.css': false,
  })
  const fileSaving = ref(false)
  const fileLoaded = ref(false)
  const pageDataSet = shallowRef<DataSet | null>(null)
  const pageDataDocument = shallowRef<Record<string, unknown> | null>(null)
  const pageDataSetError = ref<string | null>(null)
  const pageDataHistory = ref<DataSetHistorySnapshot[]>([])
  const pageDataHistoryBaseIndex = ref(-1)
  const pageDataHistoryDraft = ref<string | null>(null)
  const fileTextHistory = reactive<Record<PageFileName, string[]>>({
    'rule.json': [],
    'pagedata.json': [],
    'script.js': [],
    'style.css': [],
  })
  const fileTextHistoryCursor = reactive<Record<PageFileName, number>>({
    'rule.json': -1,
    'pagedata.json': -1,
    'script.js': -1,
    'style.css': -1,
  })
  const fileTextHistoryDraft = reactive<Record<PageFileName, string | null>>({
    'rule.json': null,
    'pagedata.json': null,
    'script.js': null,
    'style.css': null,
  })
  const fileTextLastSnapshotAt = reactive<Record<PageFileName, number>>({
    'rule.json': 0,
    'pagedata.json': 0,
    'script.js': 0,
    'style.css': 0,
  })
  const PAGE_DATA_SNAPSHOT_LIMIT = 20
  const FILE_TEXT_SNAPSHOT_LIMIT = 100
  const LOCAL_SNAPSHOT_MIN_INTERVAL_MS = 5000

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

  // ── 自动保存 ──
  const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 800

  // ── 计算属性 ──
  const hasAnyFileDirty = computed(() => Object.values(fileDirty).some(Boolean))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)
  const pageDataHistoryCount = computed(() => pageDataHistory.value.length)
  const pageDataHistoryActiveIndex = computed(() => resolvePageDataHistoryIndex(editFiles['pagedata.json'] ?? ''))
  const canPageDataHistoryBack = computed(() => {
    return canNavigatePageDataHistoryBack({
      historyCount: pageDataHistory.value.length,
      activeIndex: pageDataHistoryActiveIndex.value,
      baseIndex: pageDataHistoryBaseIndex.value,
      currentText: editFiles['pagedata.json'] ?? '',
      draftText: pageDataHistoryDraft.value,
    })
  })
  const canPageDataHistoryForward = computed(() => {
    return canNavigatePageDataHistoryForward({
      historyCount: pageDataHistory.value.length,
      activeIndex: pageDataHistoryActiveIndex.value,
      baseIndex: pageDataHistoryBaseIndex.value,
      currentText: editFiles['pagedata.json'] ?? '',
      draftText: pageDataHistoryDraft.value,
    })
  })
  const previewJson = computed(() => {
    const root: AppNavRoot = { title: '', childPlacement: 'header', children: treeData.value }
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

  function resolvePageDataHistoryIndex(rawText: string): number {
    const comparableText = tryCanonicalizePageDataText(rawText)
    return pageDataHistory.value.findIndex((entry) => tryCanonicalizePageDataText(formatPageDataSnapshot(entry)) === comparableText)
  }

  function resolveFileTextHistoryIndex(name: PageFileName, rawText?: string): number {
    if (name === 'pagedata.json') {
      return resolvePageDataHistoryIndex(rawText ?? editFiles[name] ?? '')
    }

    const comparableText = rawText ?? editFiles[name] ?? ''
    return fileTextHistory[name].findIndex((entry) => entry === comparableText)
  }

  function nowSnapshotTimestamp(): number {
    return Date.now()
  }

  function hasSnapshotIntervalElapsed(lastSnapshotAt: number, now = nowSnapshotTimestamp()): boolean {
    return lastSnapshotAt <= 0 || now - lastSnapshotAt >= LOCAL_SNAPSHOT_MIN_INTERVAL_MS
  }

  function resetFileTextHistory(name: PageFileName, text: string) {
    if (name === 'pagedata.json') {
      fileTextHistory[name] = []
      fileTextHistoryCursor[name] = -1
      fileTextHistoryDraft[name] = null
      fileTextLastSnapshotAt[name] = 0
      return
    }

    fileTextHistory[name] = [text]
    fileTextHistoryCursor[name] = 0
    fileTextHistoryDraft[name] = null
    fileTextLastSnapshotAt[name] = nowSnapshotTimestamp()
  }

  function clearFileTextHistory(name: PageFileName) {
    fileTextHistory[name] = []
    fileTextHistoryCursor[name] = -1
    fileTextHistoryDraft[name] = null
    fileTextLastSnapshotAt[name] = 0
  }

  function commitFileTextHistory(name: PageFileName, text: string): boolean {
    if (name === 'pagedata.json') return false

    const currentIndex = fileTextHistoryCursor[name]
    const currentEntries = fileTextHistory[name]
    const currentText = currentIndex >= 0 ? currentEntries[currentIndex] : undefined
    if (currentText === text) {
      return false
    }

    const now = nowSnapshotTimestamp()
    if (!hasSnapshotIntervalElapsed(fileTextLastSnapshotAt[name], now)) {
      return false
    }

    let nextEntries = currentIndex >= 0
      ? currentEntries.slice(0, currentIndex + 1)
      : []
    nextEntries = [...nextEntries, text]

    if (nextEntries.length > FILE_TEXT_SNAPSHOT_LIMIT) {
      nextEntries = nextEntries.slice(nextEntries.length - FILE_TEXT_SNAPSHOT_LIMIT)
    }

    fileTextHistory[name] = nextEntries
    fileTextHistoryCursor[name] = nextEntries.length - 1
    fileTextHistoryDraft[name] = null
    fileTextLastSnapshotAt[name] = now
    return true
  }

  function getFileHistoryBackTargetIndex(name: PageFileName): number {
    const historyCount = fileTextHistory[name].length
    if (historyCount === 0) return -1

    const activeIndex = resolveFileTextHistoryIndex(name, editFiles[name] ?? '')
    if (activeIndex === -1) {
      const baseIndex = fileTextHistoryCursor[name]
      if (baseIndex >= 0 && baseIndex < historyCount) {
        return baseIndex
      }
      return historyCount - 1
    }

    if (activeIndex <= 0) {
      return -1
    }

    return activeIndex - 1
  }

  function getFileHistoryForwardTarget(name: PageFileName): { kind: 'none' } | { kind: 'draft' } | { kind: 'history'; index: number } {
    const historyCount = fileTextHistory[name].length
    const activeIndex = resolveFileTextHistoryIndex(name, editFiles[name] ?? '')
    if (historyCount === 0 || activeIndex === -1) {
      return { kind: 'none' }
    }

    const baseIndex = fileTextHistoryCursor[name]
    const draftText = fileTextHistoryDraft[name]

    if (draftText !== null && baseIndex >= 0) {
      if (activeIndex < baseIndex) {
        return { kind: 'history', index: activeIndex + 1 }
      }

      if (activeIndex === baseIndex) {
        return { kind: 'draft' }
      }

      return { kind: 'none' }
    }

    if (activeIndex < historyCount - 1) {
      return { kind: 'history', index: activeIndex + 1 }
    }

    return { kind: 'none' }
  }

  function getFileHistoryCount(name: PageFileName): number {
    if (name === 'pagedata.json') {
      return pageDataHistoryCount.value
    }
    return fileTextHistory[name].length
  }

  function getFileSnapshotCount(name: PageFileName): number {
    return getFileHistoryCount(name)
  }

  function canFileHistoryBack(name: PageFileName): boolean {
    if (name === 'pagedata.json') {
      return canPageDataHistoryBack.value
    }
    return getFileHistoryBackTargetIndex(name) >= 0
  }

  function canUndoFileSnapshot(name: PageFileName): boolean {
    return canFileHistoryBack(name)
  }

  function canFileHistoryForward(name: PageFileName): boolean {
    if (name === 'pagedata.json') {
      return canPageDataHistoryForward.value
    }
    return getFileHistoryForwardTarget(name).kind !== 'none'
  }

  function canRedoFileSnapshot(name: PageFileName): boolean {
    return canFileHistoryForward(name)
  }

  function shouldCommitLocalPageDataHistory(canonicalText: string): boolean {
    if (!canonicalText.trim()) return false

    const latestEntry = pageDataHistory.value[0]
    if (!latestEntry) return true

    if (tryCanonicalizePageDataText(formatPageDataSnapshot(latestEntry)) === canonicalText) {
      return false
    }

    const latestTimestamp = typeof latestEntry.timestamp === 'number'
      ? latestEntry.timestamp
      : Number(latestEntry.timestamp)

    return hasSnapshotIntervalElapsed(Number.isFinite(latestTimestamp) ? latestTimestamp : 0)
  }

  function commitLocalPageDataHistory(canonicalPageData: CanonicalPageData, summary: string): boolean {
    const pageId = activePageId.value
    if (!pageId) return false
    if (!shouldCommitLocalPageDataHistory(canonicalPageData.text)) return false

    canonicalPageData.dataSet.pageId = pageId

    commitDataSetSnapshot(canonicalPageData.dataSet, {
      scopeId: pageId,
      pageId,
      maxEntries: PAGE_DATA_SNAPSHOT_LIMIT,
      label: `${pageId}/pagedata.json`,
      summary,
      sourceData: canonicalPageData.value,
      version: (pageDataHistory.value[0]?.version ?? 0) + 1,
    })

    refreshPageDataHistory()
    pageDataHistoryBaseIndex.value = 0
    pageDataHistoryDraft.value = null
    return true
  }

  function applyCanonicalPageData(canonicalPageData: CanonicalPageData) {
    const { dataSet, value } = canonicalPageData
    if (activePageId.value) {
      dataSet.pageId = activePageId.value
    }
    pageDataSet.value = dataSet
    pageDataDocument.value = value
    pageDataSetError.value = null
  }

  function applyPageDataEditorText(rawText: string) {
    const nextText = tryCanonicalizePageDataText(rawText)
    editFiles['pagedata.json'] = nextText
    fileDirty['pagedata.json'] = nextText !== savedFiles['pagedata.json']
    syncPageDataBinding(nextText)
  }

  function updatePageDataDocument(nextValue: Record<string, unknown>) {
    const canonicalPageData = canonicalizePageDataValue(nextValue)
    editFiles['pagedata.json'] = canonicalPageData.text
    fileDirty['pagedata.json'] = canonicalPageData.text !== savedFiles['pagedata.json']
    pageDataHistoryDraft.value = null
    applyCanonicalPageData(canonicalPageData)
    if (!commitLocalPageDataHistory(canonicalPageData, 'DevSystem 结构化编辑 pagedata.json')) {
      refreshPageDataHistory()
    }
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = findPageMeta(pageId)
    if (!pageMeta) return true
    return String(pageMeta['pageType'] ?? 'config') !== 'system-page'
  }

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

  function normalizeLinkTarget(value: unknown): LinkTarget {
    if (value === 'new-tab') return 'new-tab'
    return 'iframe'
  }

  function defaultIconByKind(kind: NavNodeKind): string {
    return DEFAULT_ICON_BY_KIND[kind]
  }

  function syncPageFilesForNode(node: NavNode, forceReload: boolean) {
    const pageId = normalizePageIdFromPath(node.path)
    if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
      if (forceReload || activePageId.value !== pageId || !fileLoaded.value) {
        void loadPageFiles(pageId)
      } else {
        activePageId.value = pageId
      }
      return
    }

    clearFiles()
  }

  function syncIconByNodeKind(nextKind: NavNodeKind, previousKind: NavNodeKind) {
    const previousDefault = defaultIconByKind(previousKind)
    const nextDefault = defaultIconByKind(nextKind)
    if (!editForm.icon || editForm.icon === previousDefault) {
      editForm.icon = nextDefault
    }
  }

  function applyNodeKindToNode(node: NavNode, parentPlacement?: string): NavNode {
    const cloned = deepClone(node)
    // 父容器是工具栏/用户菜单且节点无 nodeKind → system-action
    if (cloned.nodeKind === undefined && (parentPlacement === 'toolbar' || parentPlacement === 'user-menu')) {
      cloned.nodeKind = 'system-action'
    }
    // nodeKind 若仍缺失，保持 undefined → 后端写回时会报错，便于发现数据问题
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

  function applyNodeKindPreset(kind: NavNodeKind) {
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
      // linkTarget 已是 LinkTarget 类型，保留当前值
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

  function buildMigratedNavRoot(config: { title?: string; childPlacement?: string; children?: NavNode[]; homePath?: string }): AppNavRoot {
    const root: AppNavRoot = {
      title: config.title ?? '',
      childPlacement: normalizeRootChildPlacement(config.childPlacement),
      children: (config.children ?? []).map(node => applyNodeKindToNode(node)),
    }
    const homePath = typeof config.homePath === 'string' ? config.homePath.trim() : ''
    if (homePath) {
      root.homePath = homePath
    }
    return root
  }

  async function loadNavConfig(options?: { preserveSelectedNodeId?: string | null }) {
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.id ?? null
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
        syncPageFilesForNode(matchedNode, false)
        return
      }
    }

    if (treeData.value.length === 0) {
      selectedNode.value = null
      clearFiles()
      return
    }

    // 默认选中第一行
    const firstNode = treeData.value[0]
    if (firstNode) {
      selectedNode.value = firstNode
      loadNodeToForm(firstNode)
      syncPageFilesForNode(firstNode, true)
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
      addStatus(`页面 ${pageId} 为 system-page，配置文件由前端组件维护`, 'info')
      return
    }

    activePageId.value = pageId
    fileLoaded.value = false
    for (const k of PAGE_FILE_NAMES) {
      fileDirty[k] = false
      editFiles[k] = ''
      savedFiles[k] = ''
      clearFileTextHistory(k)
    }
    for (const fname of PAGE_FILE_NAMES) {
      try {
        const data = await http.get<Record<string, unknown>>(`${getPageApi()}/${encodeURIComponent(pageId)}/${fname}`)
        const content = typeof data['content'] === 'string' ? data['content'] : ''
        editFiles[fname] = fname === 'pagedata.json'
          ? tryCanonicalizePageDataText(content)
          : content
        savedFiles[fname] = editFiles[fname]
        resetFileTextHistory(fname, editFiles[fname])
      } catch {
        editFiles[fname] = ''
        savedFiles[fname] = ''
        resetFileTextHistory(fname, '')
      }
    }
    syncPageDataBinding(editFiles['pagedata.json'] ?? '', {
      trackLocalHistory: true,
      historySummary: 'DevSystem 加载后端 pagedata.json',
    })
    refreshPageDataHistory()
    pageDataHistoryBaseIndex.value = resolvePageDataHistoryIndex(editFiles['pagedata.json'] ?? '')
    pageDataHistoryDraft.value = null
    fileLoaded.value = true
    addStatus(`已加载 ${pageId} 配置文件`, 'info')
  }

  function clearFiles() {
    activePageId.value = ''
    fileLoaded.value = false
    for (const k of PAGE_FILE_NAMES) {
      editFiles[k] = ''
      savedFiles[k] = ''
      fileDirty[k] = false
      clearFileTextHistory(k)
    }
    pageDataSet.value = null
    pageDataDocument.value = null
    pageDataSetError.value = null
    pageDataHistory.value = []
    pageDataHistoryBaseIndex.value = -1
    pageDataHistoryDraft.value = null
  }

  function refreshPageDataHistory() {
    const pageId = activePageId.value
    if (!pageId) {
      pageDataHistory.value = []
      return
    }

    pageDataHistory.value = listDataSetSnapshots({ pageId, scopeId: pageId })
  }

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

  async function readRemotePageVersionFile(
    version: number,
    filename: PageFileName,
  ): Promise<BackendPageVersionFile | null> {
    const pageId = activePageId.value
    if (!pageId) return null

    try {
      const result = await http.get<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}`,
      )
      const resolvedFilename = isPageFileName(String(result['filename'] ?? ''))
        ? String(result['filename']) as PageFileName
        : filename
      return {
        pageId: String(result['pageId'] ?? pageId),
        filename: resolvedFilename,
        version: parseOptionalNumber(result['version']) ?? version,
        createdAt: typeof result['createdAt'] === 'string' ? result['createdAt'] : '',
        content: typeof result['content'] === 'string' ? result['content'] : '',
        isCurrent: Boolean(result['isCurrent']),
        modifiedBy: typeof result['modifiedBy'] === 'string' ? result['modifiedBy'] : null,
      }
    } catch (e) {
      addStatus(`读取后端版本 v${version} 失败: ${String(e)}`, 'error')
      return null
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
      await loadPageFiles(pageId)
      addStatus(`页面 ${pageId} 已将 ${filename} 版本 v${version} 恢复为当前版`, 'success')
      return true
    } catch (e) {
      addStatus(`恢复版本失败: ${String(e)}`, 'error')
      return false
    }
  }

  function syncPageDataBinding(
    rawText: string,
    options?: {
      trackLocalHistory?: boolean
      historySummary?: string
    },
  ) {
    if (!rawText.trim()) {
      pageDataSet.value = null
      pageDataDocument.value = null
      pageDataSetError.value = null
      refreshPageDataHistory()
      return
    }

    let historyCommitted = false
    try {
      const canonicalPageData = canonicalizePageDataJson(rawText)
      applyCanonicalPageData(canonicalPageData)
      if (options?.trackLocalHistory) {
        historyCommitted = commitLocalPageDataHistory(
          canonicalPageData,
          options.historySummary ?? 'DevSystem 本地编辑 pagedata.json',
        )
      }
    } catch (error) {
      pageDataSet.value = null
      pageDataDocument.value = null
      pageDataSetError.value = error instanceof Error ? error.message : String(error)
    }

    if (!historyCommitted) {
      refreshPageDataHistory()
    }
  }

  function updatePageFile(name: string, value: string) {
    editFiles[name] = value
    if (name === 'pagedata.json') {
      fileDirty[name] = value !== savedFiles[name]
      pageDataHistoryDraft.value = null
      syncPageDataBinding(value, {
        trackLocalHistory: true,
        historySummary: 'DevSystem 文本编辑 pagedata.json',
      })
      return
    }

    fileDirty[name] = value !== savedFiles[name]
    if (isPageFileName(name)) {
      fileTextHistoryDraft[name] = null
      commitFileTextHistory(name, value)
    }
  }

  function restorePageDataHistory(entryId: string): boolean {
    const pageId = activePageId.value
    if (!pageId) return false

    const entry = getDataSetSnapshot({ pageId, scopeId: pageId }, { entryId })
    if (!entry) {
      addStatus('未找到对应的 pagedata 快照', 'warning')
      return false
    }

    pageDataHistoryDraft.value = getDraftTextForHistoryRestore({
      historyCount: pageDataHistory.value.length,
      activeIndex: resolvePageDataHistoryIndex(editFiles['pagedata.json'] ?? ''),
      baseIndex: pageDataHistoryBaseIndex.value,
      currentText: editFiles['pagedata.json'] ?? '',
      draftText: pageDataHistoryDraft.value,
    })
    pageDataHistoryBaseIndex.value = pageDataHistory.value.findIndex((historyEntry) => historyEntry.id === entry.id)
    applyPageDataEditorText(formatPageDataSnapshot(entry))
    addStatus(`已恢复 pagedata.json 快照 #${entry.version}，等待保存`, 'success')
    return true
  }

  function goPageDataHistoryBack(): boolean {
    const currentText = editFiles['pagedata.json'] ?? ''
    const activeIndex = resolvePageDataHistoryIndex(currentText)
    const targetIndex = getPageDataHistoryBackTargetIndex({
      historyCount: pageDataHistory.value.length,
      activeIndex,
      baseIndex: pageDataHistoryBaseIndex.value,
      currentText,
      draftText: pageDataHistoryDraft.value,
    })

    if (targetIndex < 0) return false

    const entry = pageDataHistory.value[targetIndex]
    if (!entry) return false

    if (activeIndex === -1) {
      pageDataHistoryDraft.value = currentText
    }

    pageDataHistoryBaseIndex.value = targetIndex
    applyPageDataEditorText(formatPageDataSnapshot(entry))
    addStatus(`已回退到快照 #${entry.version}，等待保存`, 'success')
    return true
  }

  function goPageDataHistoryForward(): boolean {
    const currentText = editFiles['pagedata.json'] ?? ''
    const activeIndex = resolvePageDataHistoryIndex(currentText)

    const forwardTarget = getPageDataHistoryForwardTarget({
      historyCount: pageDataHistory.value.length,
      activeIndex,
      baseIndex: pageDataHistoryBaseIndex.value,
      currentText,
      draftText: pageDataHistoryDraft.value,
    })

    if (forwardTarget.kind === 'draft' && pageDataHistoryDraft.value !== null) {
      const draftText = pageDataHistoryDraft.value
      pageDataHistoryDraft.value = null
      applyPageDataEditorText(draftText)
      addStatus('已前进到未保存草稿，等待保存', 'success')
      return true
    }

    if (forwardTarget.kind !== 'history') return false

    const entry = pageDataHistory.value[forwardTarget.index]
    if (!entry) return false

    pageDataHistoryBaseIndex.value = forwardTarget.index
    applyPageDataEditorText(formatPageDataSnapshot(entry))
    addStatus(`已前进到快照 #${entry.version}，等待保存`, 'success')
    return true
  }

  function goFileHistoryBack(name: PageFileName): boolean {
    if (name === 'pagedata.json') {
      return goPageDataHistoryBack()
    }

    const nextIndex = getFileHistoryBackTargetIndex(name)
    if (nextIndex < 0) return false

    const activeIndex = resolveFileTextHistoryIndex(name, editFiles[name] ?? '')
    const nextText = fileTextHistory[name][nextIndex]
    if (nextText === undefined) return false

    if (activeIndex === -1) {
      fileTextHistoryDraft[name] = editFiles[name] ?? ''
    }

    fileTextHistoryCursor[name] = nextIndex
    editFiles[name] = nextText
    fileDirty[name] = nextText !== savedFiles[name]
    addStatus(`已撤销 ${name} 本地修改，等待保存`, 'success')
    return true
  }

  function undoFileSnapshot(name: PageFileName): boolean {
    return goFileHistoryBack(name)
  }

  function goFileHistoryForward(name: PageFileName): boolean {
    if (name === 'pagedata.json') {
      return goPageDataHistoryForward()
    }

    const forwardTarget = getFileHistoryForwardTarget(name)

    if (forwardTarget.kind === 'draft' && fileTextHistoryDraft[name] !== null) {
      const draftText = fileTextHistoryDraft[name]
      fileTextHistoryDraft[name] = null
      editFiles[name] = draftText
      fileDirty[name] = draftText !== savedFiles[name]
      addStatus(`已重做 ${name} 本地修改，等待保存`, 'success')
      return true
    }

    if (forwardTarget.kind !== 'history') return false

    const nextText = fileTextHistory[name][forwardTarget.index]
    if (nextText === undefined) return false

    fileTextHistoryCursor[name] = forwardTarget.index
    editFiles[name] = nextText
    fileDirty[name] = nextText !== savedFiles[name]
    addStatus(`已重做 ${name} 本地修改，等待保存`, 'success')
    return true
  }

  function redoFileSnapshot(name: PageFileName): boolean {
    return goFileHistoryForward(name)
  }

  function onLinkUrlChanged() {
    markNavDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkTarget() {
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
  // 节点 ↔ 表单 同步
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: NavNode) {
    editForm.id = node.id
    editForm.title = node.title
    editForm.icon = node.icon ?? ''
    editForm.nodeKind = node.nodeKind ?? 'page'
    editForm.dividerAfter = node.dividerAfter ?? false
    editForm.description = node.description ?? ''
    editForm.path = node.path ?? ''
    editForm.redirect = node.redirect ?? ''
    editForm.linkTarget = normalizeLinkTarget(node.linkTarget)
    editForm.parentPageId = node.parentPageId ?? ''
    editForm.refId = node.refId ?? ''
    editForm.childPlacement = node.childPlacement ?? ''
    editForm.order = node.order ?? 0
    editForm.hidden = node.hidden ?? false
    editForm.disabled = node.disabled ?? false
    editForm.permissionMode = node.permissionMode ?? 'masked'

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
      editForm.hidden = true
      editForm.path = ''
      editForm.redirect = ''
      editForm.linkTarget = 'iframe'
    } else if (editForm.nodeKind === 'link') {
      editForm.redirect = ''
      // linkTarget 已是 LinkTarget 类型，保留当前值
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

    // type / id / title 是必选字段，不参与清理循环
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

  function markNavDirty() {
    navDirty.value = true
    scheduleAutoSave()
  }

  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveStatus.value = 'pending'
    autoSaveTimer = setTimeout(() => { void doAutoSave() }, AUTO_SAVE_DELAY)
  }

  function cancelAutoSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
    if (autoSaveStatus.value === 'pending') autoSaveStatus.value = 'idle'
  }

  async function doAutoSave() {
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

  async function saveNavConfig() {
    if (navDirty.value) applyNavChanges()
    navSaving.value = true
    const root: AppNavRoot = { title: '', childPlacement: 'header', children: treeData.value }
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
      const body: Record<string, string> = { ...editFiles }
      const currentPageDataText = editFiles['pagedata.json'] ?? ''
      let canonicalPageDataText = currentPageDataText
      let canonicalPageData: CanonicalPageData | null = null

      if (currentPageDataText.trim()) {
        canonicalPageData = canonicalizePageDataJson(currentPageDataText)
        canonicalPageDataText = canonicalPageData.text
        body['pagedata.json'] = canonicalPageDataText
      }

      if (canonicalPageData) {
        canonicalPageData.dataSet.pageId = pageId
        applyCanonicalPageData(canonicalPageData)
      }

      if (canonicalPageDataText !== currentPageDataText) {
        editFiles['pagedata.json'] = canonicalPageDataText
      }

      for (const k of PAGE_FILE_NAMES) {
        const fileContent = body[k] ?? editFiles[k] ?? ''
        await http.put<Record<string, unknown>>(
          `${getPageApi()}/${encodeURIComponent(pageId)}/${k}`,
          fileContent,
          { headers: { 'Content-Type': 'text/plain' } },
        )
        savedFiles[k] = fileContent
        fileDirty[k] = false
      }
      refreshPageDataHistory()
      pageDataHistoryDraft.value = null
      addStatus(`页面 ${pageId} 已保存`, 'success')
      await loadPages()
    } catch (e) {
      addStatus(`文件保存失败: ${String(e)}`, 'error')
    } finally {
      fileSaving.value = false
    }
  }

  async function savePageFile(name: PageFileName) {
    const pageId = activePageId.value
    if (!pageId) return

    fileSaving.value = true
    try {
      let content = editFiles[name] ?? ''

      if (name === 'pagedata.json') {
        if (content.trim()) {
          const canonicalPageData = canonicalizePageDataJson(content)
          canonicalPageData.dataSet.pageId = pageId
          applyCanonicalPageData(canonicalPageData)
          content = canonicalPageData.text
          editFiles[name] = content
        } else {
          pageDataSet.value = null
          pageDataDocument.value = null
          pageDataSetError.value = null
        }
      }

      await http.put<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${name}`,
        content,
        { headers: { 'Content-Type': 'text/plain' } },
      )

      savedFiles[name] = content
      fileDirty[name] = false
      if (name === 'pagedata.json') {
        refreshPageDataHistory()
        pageDataHistoryDraft.value = null
      }

      addStatus(`页面 ${pageId} 已保存 ${name}`, 'success')
      await loadPages()
    } catch (e) {
      addStatus(`保存 ${name} 失败: ${String(e)}`, 'error')
    } finally {
      fileSaving.value = false
    }
  }

  async function saveByTab(tab: DevWorkspaceTab) {
    if (isPageFileName(tab)) {
      await savePageFile(tab)
      return
    }

    if (selectedNode.value) {
      await saveNodeChanges()
      return
    }

    await saveNavConfig()
  }

  async function refreshByTab(tab: DevWorkspaceTab) {
    cancelAutoSave()

    if (isPageFileName(tab)) {
      if (activePageId.value) {
        await loadPageFiles(activePageId.value)
      }
      return
    }

    await Promise.all([
      loadNavConfig({ preserveSelectedNodeId: selectedNode.value?.id ?? null }),
      loadPages(),
    ])
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
    cancelAutoSave()
    if (navDirty.value && selectedNode.value) void saveNodeChanges()
    selectedNode.value = node
    loadNodeToForm(node)
    syncPageFilesForNode(node, true)
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
      const fallbackKind = selectedNode.value?.nodeKind ?? 'page'
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

  async function restoreReservedRootGroup(placement: 'toolbar' | 'user-menu') {
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

  function addChildNode(parent: NavNode) {
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

  function removeNodeFromTree(node: { parent: { data: NavNode } }, data: NavNode) {
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
  function fillDemoContext() {
    hasContext.value = true
    contextItems.value = DEMO_CONTEXT_ITEMS.map(item => ({ ...item }))
    contextConfig.placeholder = DEMO_CONTEXT_CONFIG.placeholder
    contextConfig.defaultValue = DEMO_CONTEXT_CONFIG.defaultValue
    contextConfig.paramName = DEMO_CONTEXT_CONFIG.paramName
    markNavDirty()
    addStatus('已填充模块上下文演示数据', 'info')
  }

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
    pageDataSet,
    pageDataDocument,
    pageDataSetError,
    pageDataHistory,

    // 页面列表
    pageList,

    // 状态
    statusMessages,
    linkProbeLoading,
    linkProbeInfo,
    aiPanelVisible,
    autoSaveStatus,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,
    pageDataHistoryCount,
    pageDataHistoryActiveIndex,
    canPageDataHistoryBack,
    canPageDataHistoryForward,
    previewJson,
    getFileSnapshotCount,
    getFileHistoryCount,
    canUndoFileSnapshot,
    canRedoFileSnapshot,
    canFileHistoryBack,
    canFileHistoryForward,

    // 方法
    addStatus,
    loadNavConfig,
    loadPages,
    loadPageFiles,
    clearFiles,
    refreshPageDataHistory,
    listRemotePageVersions,
    readRemotePageVersionFile,
    restoreRemotePageVersion,
    updatePageDataDocument,
    restorePageDataHistory,
    goPageDataHistoryBack,
    goPageDataHistoryForward,
    undoFileSnapshot,
    redoFileSnapshot,
    goFileHistoryBack,
    goFileHistoryForward,
    updatePageFile,
    savePageFile,
    saveByTab,
    refreshByTab,
    onLinkUrlChanged,
    probeLinkTarget,
    selectPage,
    loadNodeToForm,
    applyNavChanges,
    markNavDirty,
    cancelAutoSave,
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
    toggleContext,
    addContextItem,
    removeContextItem,
    fillDemoContext,
    createPage,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
