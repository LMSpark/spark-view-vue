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
import { refreshRoutes } from '@spark-view/spark-app'
import { SparkNodeTree, type SparkNode } from '@spark-view/spark-component'
import type { EditLiveModelAdapter } from '@spark-view/spark-ai'
import { DataSetCrudTool, type IDataSetMetadata } from '@spark-view/spark-data'
import { demoNavRoot } from '@/layout/demo-nav'
import { canonicalizePageDataJson, canonicalizePageDataValue } from './policies/pageDataJsonSchema'
import { loadTextHistory, saveTextHistory, clearTextHistoryStorage } from './composables/textHistoryStore'
import { hasDesignerProjectionChanges } from './composables/designerProjection'

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export interface StatusMessage {
  text: string
  type: 'success' | 'warning' | 'error' | 'info'
  time: string
}

interface PageEditTransaction {
  id: number
  pageId: string
  source: 'ai' | 'manual'
  files: PageFileName[]
  before: Partial<Record<PageFileName, string>>
  after: Partial<Record<PageFileName, string>>
  createdAt: number
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

export const PAGE_FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
export type PageFileName = typeof PAGE_FILE_NAMES[number]
export type DevWorkspaceTab = 'props' | 'preview' | PageFileName

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
type PageFileLoadState = 'idle' | 'loading' | 'loaded'

function parseRuleDocument(rawText: string): SparkNode[] {
  if (!rawText.trim()) {
    throw new Error('缺少 rule.json')
  }

  const parsedRule = JSON.parse(rawText) as unknown
  const ruleJson = Array.isArray(parsedRule)
    ? parsedRule
    : (
        typeof parsedRule === 'object'
        && parsedRule !== null
        && Array.isArray((parsedRule as Record<string, unknown>)['children'])
      )
        ? (parsedRule as Record<string, unknown>)['children'] as unknown[]
        : null

  if (!Array.isArray(ruleJson)) {
    throw new Error('rule.json 必须是数组或含 children 的根对象')
  }

  return ruleJson as SparkNode[]
}

function serializeRuleDocument(ruleJson: SparkNode[]): string {
  return `${JSON.stringify(ruleJson, null, 2)}\n`
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
  const fileLoadState = reactive<Record<PageFileName, PageFileLoadState>>({
    'rule.json': 'idle',
    'pagedata.json': 'idle',
    'script.js': 'idle',
    'style.css': 'idle',
  })
  let activePageFilesLoadPromise: Promise<void> | null = null
  let activePageFilesLoadPageId = ''
  let activePageFilesLoadEpoch = 0
  const pageRuleDocument = shallowRef<SparkNode[] | null>(null)
  const pageRuleTree = shallowRef<SparkNodeTree | null>(null)
  const pageDataTool = shallowRef<DataSetCrudTool | null>(null)
  const pageDataDocument = shallowRef<IDataSetMetadata | null>(null)
  const pageScriptDocument = ref<string | null>(null)
  const pageStyleDocument = ref<string | null>(null)
  const pageDataSetError = ref<string | null>(null)
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
  const pageEditTransactions = reactive<Record<string, PageEditTransaction[]>>({})
  const pageEditTransactionCursor = reactive<Record<string, number>>({})
  let nextPageEditTransactionId = 1

  // ── AI 面板 ──
  const aiPanelVisible = ref(false)

  function readComparablePageDataMetadata(content: string | undefined): IDataSetMetadata | null {
    if (typeof content !== 'string' || content.trim().length === 0) return null

    try {
      return DataSetCrudTool.fromJson(content).toJson()
    } catch {
      return null
    }
  }

  function hasLivePageDataChangesAgainstEditFile(): boolean {
    const liveMetadata = pageDataDocument.value ?? pageDataTool.value?.toJson() ?? null
    if (liveMetadata === null) return false
    return hasDesignerProjectionChanges(liveMetadata, readComparablePageDataMetadata(editFiles['pagedata.json']))
  }

  const pageDataDesignerDirty = computed(() => hasLivePageDataChangesAgainstEditFile())

  // ── 自动保存 ──
  const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 800

  // ── 计算属性 ──
  const hasAnyFileDirty = computed(() => Object.values(fileDirty).some(Boolean))
  const hasAnyDirty = computed(() => navDirty.value || hasAnyFileDirty.value)

  function recomputePageDataFileDirty() {
    fileDirty['pagedata.json'] = editFiles['pagedata.json'] !== savedFiles['pagedata.json'] || hasLivePageDataChangesAgainstEditFile()
  }

  function normalizePageIdFromPath(path: string | undefined | null): string {
    return path ? path.replace(/^\/+/, '').trim() : ''
  }

  function buildActivePageStorageKey(): string {
    if (typeof window === 'undefined') {
      return 'dev-system:active-page'
    }
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
      if (pageId) {
        window.localStorage.setItem(key, pageId)
      } else {
        window.localStorage.removeItem(key)
      }
    } catch {
      // Ignore storage failures to keep editor flow available.
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

  function resolveFileTextHistoryIndex(name: PageFileName, rawText?: string): number {
    const comparableText = name === 'pagedata.json'
      ? tryCanonicalizePageDataText(rawText ?? editFiles[name] ?? '')
      : (rawText ?? editFiles[name] ?? '')
    return fileTextHistory[name].findIndex((entry) => entry === comparableText)
  }

  function nowSnapshotTimestamp(): number {
    return Date.now()
  }

  function hasSnapshotIntervalElapsed(lastSnapshotAt: number, now = nowSnapshotTimestamp()): boolean {
    return lastSnapshotAt <= 0 || now - lastSnapshotAt >= LOCAL_SNAPSHOT_MIN_INTERVAL_MS
  }

  function clearPageDataBinding() {
    pageDataTool.value = null
    pageDataDocument.value = null
    pageDataSetError.value = null
    recomputePageDataFileDirty()
  }

  function syncPageDataDocumentFromTool(): IDataSetMetadata | null {
    const tool = pageDataTool.value
    if (!tool) {
      pageDataDocument.value = null
      recomputePageDataFileDirty()
      return null
    }

    if (activePageId.value) {
      tool.dataSet.pageId = activePageId.value
    }

    const nextValue = tool.toJson()
    pageDataDocument.value = nextValue
    pageDataSetError.value = null
    recomputePageDataFileDirty()
    return nextValue
  }

  function ensureLivePageDataTool(): DataSetCrudTool | null {
    if (pageDataTool.value) return pageDataTool.value

    if (pageDataDocument.value !== null) {
      replaceLivePageData(pageDataDocument.value, { preserveHistory: false })
      return pageDataTool.value
    }

    const rawText = editFiles['pagedata.json'] ?? ''
    if (!rawText.trim()) return null

    replaceLivePageData(rawText, { preserveHistory: false })
    return pageDataTool.value
  }

  function replaceLivePageData(
    snapshot: IDataSetMetadata | Record<string, unknown> | string,
    options?: { preserveHistory?: boolean },
  ): boolean {
    try {
      const nextTool = DataSetCrudTool.reconcileFromJson(
        snapshot,
        pageDataTool.value ?? undefined,
        options?.preserveHistory === undefined ? undefined : { preserveHistory: options.preserveHistory },
      )
      pageDataTool.value = nextTool
      syncPageDataDocumentFromTool()
      return true
    } catch (error) {
      pageDataTool.value = null
      pageDataDocument.value = null
      pageDataSetError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  function mutateLivePageData(mutator: (tool: DataSetCrudTool) => void): boolean {
    const tool = ensureLivePageDataTool()
    if (!tool) return false

    mutator(tool)
    syncPageDataDocumentFromTool()
    return true
  }

  function undoLivePageData(): boolean {
    const tool = ensureLivePageDataTool()
    if (!tool) return false
    const ok = tool.undo()
    if (!ok) return false
    syncPageDataDocumentFromTool()
    return true
  }

  function redoLivePageData(): boolean {
    const tool = ensureLivePageDataTool()
    if (!tool) return false
    const ok = tool.redo()
    if (!ok) return false
    syncPageDataDocumentFromTool()
    return true
  }

  function clearRuleBinding() {
    pageRuleDocument.value = null
    pageRuleTree.value = null
  }

  function clearScriptBinding() {
    pageScriptDocument.value = null
  }

  function clearStyleBinding() {
    pageStyleDocument.value = null
  }

  function invalidateActivePageFilesLoad() {
    activePageFilesLoadPromise = null
    activePageFilesLoadPageId = ''
    activePageFilesLoadEpoch += 1
  }

  function clearFileBinding(name: PageFileName) {
    if (name === 'pagedata.json') {
      clearPageDataBinding()
      return
    }

    if (name === 'rule.json') {
      clearRuleBinding()
      return
    }

    if (name === 'script.js') {
      clearScriptBinding()
      return
    }

    clearStyleBinding()
  }

  function resetPageFileRuntimeState(name: PageFileName) {
    editFiles[name] = ''
    savedFiles[name] = ''
    fileDirty[name] = false
    fileTextHistory[name] = []
    fileTextHistoryCursor[name] = -1
    fileTextHistoryDraft[name] = null
    fileTextLastSnapshotAt[name] = 0
    fileLoadState[name] = 'idle'
    clearFileBinding(name)
  }

  function markPageFileNeedsReload(name: PageFileName) {
    invalidateActivePageFilesLoad()
    fileLoadState[name] = 'idle'
    clearFileBinding(name)
  }

  function syncRuleDocumentFromTree(): SparkNode[] | null {
    const tree = pageRuleTree.value
    if (!tree) {
      pageRuleDocument.value = null
      return null
    }

    const root = tree.toJSON()
    const ruleJson = Array.isArray(root.children)
      ? deepClone(root.children as SparkNode[])
      : []
    pageRuleDocument.value = ruleJson
    return ruleJson
  }

  function ensureLiveRuleTree(): SparkNodeTree | null {
    if (pageRuleTree.value) return pageRuleTree.value

    if (pageRuleDocument.value !== null) {
      pageRuleTree.value = SparkNodeTree.fromJson({
        type: 'page',
        children: deepClone(pageRuleDocument.value),
      })
      syncRuleDocumentFromTree()
      return pageRuleTree.value
    }

    const rawText = editFiles['rule.json'] ?? ''
    if (!rawText.trim()) return null

    syncRuleBinding(rawText)
    return pageRuleTree.value
  }

  function syncRuleBinding(rawText: string) {
    if (!rawText.trim()) {
      clearRuleBinding()
      return
    }

    try {
      const parsedRule = parseRuleDocument(rawText)
      const nextRoot: SparkNode = { type: 'page', children: parsedRule }
      const normalizedRoot = SparkNodeTree.fromJson(nextRoot).toJSON()
      if (pageRuleTree.value) {
        pageRuleTree.value.loadRoot(normalizedRoot)
      } else {
        pageRuleTree.value = SparkNodeTree.fromJson(normalizedRoot)
      }
      const normalizedRule = syncRuleDocumentFromTree()
      if (normalizedRule !== null) {
        const normalizedText = serializeRuleDocument(normalizedRule)
        editFiles['rule.json'] = normalizedText
        if (fileLoadState['rule.json'] === 'loading') {
          savedFiles['rule.json'] = normalizedText
        }
        fileDirty['rule.json'] = editFiles['rule.json'] !== savedFiles['rule.json']
      }
    } catch {
      pageRuleDocument.value = null
      pageRuleTree.value = null
    }
  }

  function syncScriptBinding(rawText: string) {
    pageScriptDocument.value = rawText
  }

  function syncStyleBinding(rawText: string) {
    pageStyleDocument.value = rawText
  }

  function setActivePageContext(pageId: string, forceReset = false): boolean {
    if (!pageId) {
      clearFiles()
      return false
    }

    if (!isBackendConfigPage(pageId)) {
      clearFiles()
      return false
    }

    const shouldReset = forceReset || activePageId.value !== pageId

    if (shouldReset) {
      invalidateActivePageFilesLoad()
      for (const name of PAGE_FILE_NAMES) {
        resetPageFileRuntimeState(name)
      }
    }

    activePageId.value = pageId
    persistActivePageId(pageId)

    return true
  }

  function ensurePageEditTransactionState(pageId: string): { history: PageEditTransaction[]; cursor: number } {
    pageEditTransactions[pageId] ??= []
    pageEditTransactionCursor[pageId] ??= -1
    return {
      history: pageEditTransactions[pageId],
      cursor: pageEditTransactionCursor[pageId],
    }
  }

  function commitFileTextHistory(name: PageFileName, text: string): boolean {
    const currentEntries = fileTextHistory[name]
    const currentIndex = fileTextHistoryCursor[name]
    const currentText = currentIndex >= 0 ? currentEntries[currentIndex] : undefined
    if (currentText === text) {
      return false
    }

    // Truncate future entries immediately on branch (cursor not at end)
    // e.g. A0→A1→A2→A3, undo to A2, edit → A3 discarded right away
    if (currentIndex >= 0 && currentIndex < currentEntries.length - 1) {
      const truncated = currentEntries.slice(0, currentIndex + 1)
      fileTextHistory[name] = truncated
      const pageId = activePageId.value
      if (pageId) saveTextHistory(pageId, name, truncated)
    }

    const now = nowSnapshotTimestamp()
    if (!hasSnapshotIntervalElapsed(fileTextLastSnapshotAt[name], now)) {
      return false
    }

    let nextEntries = [...fileTextHistory[name], text]

    if (nextEntries.length > FILE_TEXT_SNAPSHOT_LIMIT) {
      nextEntries = nextEntries.slice(nextEntries.length - FILE_TEXT_SNAPSHOT_LIMIT)
    }

    fileTextHistory[name] = nextEntries
    fileTextHistoryCursor[name] = nextEntries.length - 1
    fileTextHistoryDraft[name] = null
    fileTextLastSnapshotAt[name] = now
    const pageId = activePageId.value
    if (pageId) saveTextHistory(pageId, name, nextEntries)
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
    return fileTextHistory[name].length
  }

  function getFileSnapshotCount(name: PageFileName): number {
    const entries = fileTextHistory[name]
    if (entries.length === 0) return 0
    const activeIndex = resolveFileTextHistoryIndex(name, editFiles[name] ?? '')
    if (activeIndex <= 0) {
      // Not found in history or at index 0 → check if current text differs from any entry (unsaved edit)
      if (activeIndex === -1 && entries.length > 0) {
        // Current text is an unsaved edit on top of history → can undo back to cursor
        const cursor = fileTextHistoryCursor[name]
        return cursor >= 0 ? cursor + 1 : entries.length
      }
      return 0
    }
    return activeIndex
  }

  function canFileHistoryBack(name: PageFileName): boolean {
    return getFileHistoryBackTargetIndex(name) >= 0
  }

  function canFileHistoryForward(name: PageFileName): boolean {
    return getFileHistoryForwardTarget(name).kind !== 'none'
  }

  function applyCanonicalPageData(canonicalPageData: CanonicalPageData) {
    replaceLivePageData(canonicalPageData.value as unknown as IDataSetMetadata, {
      preserveHistory: pageDataTool.value !== null,
    })
  }

  function updatePageDataDocument(nextValue: Record<string, unknown>) {
    const canonicalPageData = canonicalizePageDataValue(nextValue)
    syncFileTextAndBindings('pagedata.json', canonicalPageData.text)
    fileTextHistoryDraft['pagedata.json'] = null
    applyCanonicalPageData(canonicalPageData)
    commitFileTextHistory('pagedata.json', canonicalPageData.text)
  }

  function syncLivePageDataToEditFile(): string | null {
    const currentPageData = pageDataDocument.value ?? pageDataTool.value?.toJson() ?? null
    if (currentPageData === null) return null

    const canonicalPageData = canonicalizePageDataValue(currentPageData as unknown as Record<string, unknown>)
    syncFileTextAndBindings('pagedata.json', canonicalPageData.text)
    fileLoadState['pagedata.json'] = 'loaded'
    fileTextHistoryDraft['pagedata.json'] = null
    commitFileTextHistory('pagedata.json', canonicalPageData.text)
    return canonicalPageData.text
  }

  function syncLiveRuleToEditFile(): string | null {
    const ruleJson = syncRuleDocumentFromTree()
    if (ruleJson === null) return null

    const content = serializeRuleDocument(ruleJson)
    syncFileTextAndBindings('rule.json', content)
    fileLoadState['rule.json'] = 'loaded'
    fileTextHistoryDraft['rule.json'] = null
    commitFileTextHistory('rule.json', content)
    return content
  }

  function applyFileHistoryText(name: PageFileName, index: number, text: string): void {
    fileTextHistoryCursor[name] = index
    syncFileTextAndBindings(name, text)
  }

  function createLiveEditModelAdapter(): EditLiveModelAdapter {
    return {
      getNodeTree: () => ensureLiveRuleTree(),
      onNodeTreeChanged(nodeTree) {
        pageRuleTree.value = nodeTree
        syncLiveRuleToEditFile()
      },
      getDataSetTool: () => ensureLivePageDataTool(),
      onDataSetChanged(tool) {
        pageDataTool.value = tool
        syncPageDataDocumentFromTool()
        syncLivePageDataToEditFile()
      },
      readScript: () => pageScriptDocument.value ?? editFiles['script.js'] ?? '',
      writeScript(content) {
        updatePageFile('script.js', content)
      },
      readStyle: () => pageStyleDocument.value ?? editFiles['style.css'] ?? '',
      writeStyle(content) {
        updatePageFile('style.css', content)
      },
    }
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = pageList.value.find((page) => String(page['pageId'] ?? '') === pageId)
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

  function defaultIconByKind(kind: NavNodeKind): string {
    return DEFAULT_ICON_BY_KIND[kind]
  }

  function syncPageFilesForNode(node: NavNode, forceReload: boolean) {
    const pageId = normalizePageIdFromPath(node.path)
    if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
      setActivePageContext(pageId, forceReload || activePageId.value !== pageId)
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

  async function loadNavConfig(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }) {
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
        syncPageFilesForNode(matchedNode, false)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = findConfigNodeByPageId(treeData.value, preservedActivePageId)
      if (matchedNode) {
        selectedNode.value = matchedNode
        loadNodeToForm(matchedNode)
        syncPageFilesForNode(matchedNode, true)
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

  async function fetchRemotePageFileContent(pageId: string, name: PageFileName): Promise<string> {
    try {
      const data = await http.get<Record<string, unknown>>(`${getPageApi()}/${encodeURIComponent(pageId)}/${name}`)
      return typeof data['content'] === 'string' ? data['content'] : ''
    } catch {
      return ''
    }
  }

  function normalizePageFileText(name: PageFileName, text: string): string {
    return name === 'pagedata.json' ? tryCanonicalizePageDataText(text) : text
  }

  function restorePageFileHistoryFromStorage(pageId: string, name: PageFileName, loadedText: string): void {
    const comparableText = loadedText
    const stored = loadTextHistory(pageId, name)

    if (stored.length > 0 && stored[stored.length - 1] === comparableText) {
      fileTextHistory[name] = stored
      fileTextHistoryCursor[name] = stored.length - 1
      return
    }

    clearTextHistoryStorage(pageId, name)
    if (comparableText) {
      fileTextHistory[name] = [comparableText]
      fileTextHistoryCursor[name] = 0
      saveTextHistory(pageId, name, [comparableText])
      return
    }

    fileTextHistory[name] = []
    fileTextHistoryCursor[name] = -1
  }

  function applyLoadedPageFileSnapshot(pageId: string, name: PageFileName, loadedText: string): void {
    savedFiles[name] = loadedText
    syncFileTextAndBindings(name, loadedText)
    fileDirty[name] = false

    restorePageFileHistoryFromStorage(pageId, name, loadedText)

    fileTextHistoryDraft[name] = null
    fileTextLastSnapshotAt[name] = loadedText ? nowSnapshotTimestamp() : 0
    fileLoadState[name] = 'loaded'
  }

  function areAllActivePageFilesLoaded(): boolean {
    return PAGE_FILE_NAMES.every((entry) => fileLoadState[entry] === 'loaded')
  }

  async function ensureActivePageFilesLoaded(options?: { forceReload?: boolean }) {
    const pageId = activePageId.value
    if (!pageId) {
      return
    }

    if (activePageFilesLoadPromise && activePageFilesLoadPageId === pageId) {
      return activePageFilesLoadPromise
    }

    if (!options?.forceReload && areAllActivePageFilesLoaded()) {
      return
    }

    if (!options?.forceReload && PAGE_FILE_NAMES.some((entry) => fileDirty[entry])) {
      for (const entry of PAGE_FILE_NAMES) {
        if (fileDirty[entry] || fileLoadState[entry] === 'loading') {
          continue
        }
        if (fileLoadState[entry] !== 'idle' || savedFiles[entry] || editFiles[entry]) {
          fileLoadState[entry] = 'loaded'
        }
      }
      return
    }

    const loadEpoch = activePageFilesLoadEpoch
    activePageFilesLoadPageId = pageId

    for (const entry of PAGE_FILE_NAMES) {
      if (!options?.forceReload && fileDirty[entry]) {
        fileLoadState[entry] = 'loaded'
        continue
      }
      fileLoadState[entry] = 'loading'
    }

    const loadPromise = (async () => {
      const loadedSnapshots = await Promise.all(
        PAGE_FILE_NAMES.map(async (entry) => {
          const remoteContent = await fetchRemotePageFileContent(pageId, entry)
          return [entry, normalizePageFileText(entry, remoteContent)] as const
        }),
      )

      if (activePageFilesLoadEpoch !== loadEpoch || activePageId.value !== pageId) {
        return
      }

      for (const [entry, loadedText] of loadedSnapshots) {
        if (!options?.forceReload && fileDirty[entry]) {
          fileLoadState[entry] = 'loaded'
          continue
        }
        applyLoadedPageFileSnapshot(pageId, entry, loadedText)
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

  async function loadPageFile(name: PageFileName, options?: { forceReload?: boolean }) {
    void name
    await ensureActivePageFilesLoaded(options)
  }

  function clearFiles() {
    invalidateActivePageFilesLoad()
    activePageId.value = ''
    persistActivePageId('')
    for (const name of PAGE_FILE_NAMES) {
      resetPageFileRuntimeState(name)
    }
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

  async function restoreRemotePageVersion(version: number, filename: PageFileName): Promise<boolean> {
    const pageId = activePageId.value
    if (!pageId) return false

    try {
      await http.post<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}/__restore`,
        {},
      )
      markPageFileNeedsReload(filename)
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
      await http.delete(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}`,
      )
      addStatus(`${filename} 版本 v${version} 已删除`, 'success')
      return true
    } catch (e) {
      addStatus(`删除版本失败: ${String(e)}`, 'error')
      return false
    }
  }

  function syncPageDataBinding(rawText: string) {
    if (!rawText.trim()) {
      clearPageDataBinding()
      return
    }

    try {
      const canonicalPageData = canonicalizePageDataJson(rawText)
      applyCanonicalPageData(canonicalPageData)
    } catch (error) {
      pageDataTool.value = null
      pageDataDocument.value = null
      pageDataSetError.value = error instanceof Error ? error.message : String(error)
      recomputePageDataFileDirty()
    }
  }

  function syncFileTextAndBindings(name: PageFileName, text: string): void {
    editFiles[name] = text

    if (name === 'pagedata.json') {
      recomputePageDataFileDirty()
      syncPageDataBinding(text)
      return
    }

    fileDirty[name] = text !== savedFiles[name]
    if (name === 'rule.json') {
      syncRuleBinding(text)
      return
    }

    if (name === 'script.js') {
      syncScriptBinding(text)
      return
    }

    syncStyleBinding(text)
  }

  function updatePageFile(name: PageFileName, value: string) {
    if (name === 'pagedata.json') {
      const canonical = tryCanonicalizePageDataText(value)
      syncFileTextAndBindings(name, canonical)
      fileLoadState[name] = 'loaded'
      fileTextHistoryDraft[name] = null
      commitFileTextHistory(name, canonical)
      return
    }

    syncFileTextAndBindings(name, value)
    fileLoadState[name] = 'loaded'
    fileTextHistoryDraft[name] = null
    commitFileTextHistory(name, value)
  }

  function applyPageFiles(files: Partial<Record<PageFileName, string>>, options?: { recordTransaction?: boolean; source?: 'ai' | 'manual' }) {
    const pageId = activePageId.value
    const changedNames = PAGE_FILE_NAMES.filter((name) => files[name] !== undefined && files[name] !== editFiles[name])
    const transactionSource = options?.source ?? 'ai'
    const shouldRecordTransaction = options?.recordTransaction ?? transactionSource === 'ai'

    if (pageId && shouldRecordTransaction && changedNames.length > 0) {
      const { history, cursor } = ensurePageEditTransactionState(pageId)
      if (cursor < history.length - 1) {
        history.splice(cursor + 1)
      }

      const transaction: PageEditTransaction = {
        id: nextPageEditTransactionId++,
        pageId,
        source: transactionSource,
        files: changedNames,
        before: Object.fromEntries(changedNames.map((name) => [name, editFiles[name]])) as Partial<Record<PageFileName, string>>,
        after: Object.fromEntries(changedNames.map((name) => [name, files[name] ?? ''])) as Partial<Record<PageFileName, string>>,
        createdAt: nowSnapshotTimestamp(),
      }

      history.push(transaction)
      pageEditTransactionCursor[pageId] = history.length - 1
    }

    for (const name of changedNames) {
      updatePageFile(name, files[name] ?? '')
    }
  }

  function canPageEditTransactionBack(pageId = activePageId.value): boolean {
    if (!pageId) return false
    const { cursor } = ensurePageEditTransactionState(pageId)
    return cursor >= 0
  }

  function canPageEditTransactionForward(pageId = activePageId.value): boolean {
    if (!pageId) return false
    const { history, cursor } = ensurePageEditTransactionState(pageId)
    return cursor < history.length - 1
  }

  function getPageEditTransactionCount(pageId = activePageId.value): number {
    if (!pageId) return 0
    const { cursor } = ensurePageEditTransactionState(pageId)
    return cursor + 1
  }

  function undoPageEditTransaction(pageId = activePageId.value): boolean {
    if (!pageId) return false
    const { history, cursor } = ensurePageEditTransactionState(pageId)
    if (cursor < 0) return false
    const transaction = history[cursor]
    if (!transaction) return false

    for (const name of transaction.files) {
      const previous = transaction.before[name]
      if (previous !== undefined) {
        updatePageFile(name, previous)
      }
    }

    pageEditTransactionCursor[pageId] = cursor - 1
    addStatus(`已撤销 AI 页面事务：${transaction.files.join(', ')}`, 'success')
    return true
  }

  function redoPageEditTransaction(pageId = activePageId.value): boolean {
    if (!pageId) return false
    const { history, cursor } = ensurePageEditTransactionState(pageId)
    const nextIndex = cursor + 1
    const transaction = history[nextIndex]
    if (!transaction) return false

    for (const name of transaction.files) {
      const next = transaction.after[name]
      if (next !== undefined) {
        updatePageFile(name, next)
      }
    }

    pageEditTransactionCursor[pageId] = nextIndex
    addStatus(`已重做 AI 页面事务：${transaction.files.join(', ')}`, 'success')
    return true
  }

  function goFileHistoryBack(name: PageFileName): boolean {
    const nextIndex = getFileHistoryBackTargetIndex(name)
    if (nextIndex < 0) return false

    const activeIndex = resolveFileTextHistoryIndex(name, editFiles[name] ?? '')
    const nextText = fileTextHistory[name][nextIndex]
    if (nextText === undefined) return false

    if (activeIndex === -1) {
      fileTextHistoryDraft[name] = editFiles[name] ?? ''
    }

    applyFileHistoryText(name, nextIndex, nextText)
    addStatus(`已撤销 ${name} 本地修改，等待保存`, 'success')
    return true
  }

  function goFileHistoryForward(name: PageFileName): boolean {
    const forwardTarget = getFileHistoryForwardTarget(name)

    if (forwardTarget.kind === 'draft' && fileTextHistoryDraft[name] !== null) {
      const draftText = fileTextHistoryDraft[name]
      fileTextHistoryDraft[name] = null
      syncFileTextAndBindings(name, draftText)
      addStatus(`已重做 ${name} 本地修改，等待保存`, 'success')
      return true
    }

    if (forwardTarget.kind !== 'history') return false

    const nextText = fileTextHistory[name][forwardTarget.index]
    if (nextText === undefined) return false

    applyFileHistoryText(name, forwardTarget.index, nextText)
    addStatus(`已重做 ${name} 本地修改，等待保存`, 'success')
    return true
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
    editForm.linkTarget = node.linkTarget === 'new-tab' ? 'new-tab' : 'iframe'
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
      await refreshRoutes()
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
      await refreshRoutes()
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
    setActivePageContext(pageId, activePageId.value !== pageId)
  }

  function finalizePageFileSaved(name: PageFileName, content: string): void {
    savedFiles[name] = content
    fileDirty[name] = false
  }

  function preparePageFileContentForSave(name: PageFileName, pageId: string): string {
    let content = editFiles[name] ?? ''

    if (name === 'rule.json') {
      content = syncLiveRuleToEditFile() ?? content
    }

    if (name !== 'pagedata.json') {
      return content
    }

    if (pageDataDesignerDirty.value) {
      content = syncLivePageDataToEditFile() ?? content
    }

    if (!content.trim()) {
      clearPageDataBinding()
      return content
    }

    const canonicalPageData = canonicalizePageDataJson(content)
    canonicalPageData.tool.dataSet.pageId = pageId
    applyCanonicalPageData(canonicalPageData)
    content = canonicalPageData.text
    editFiles[name] = content
    return content
  }

  async function savePageFile(name: PageFileName) {
    const pageId = activePageId.value
    if (!pageId) return

    fileSaving.value = true
    try {
      const content = preparePageFileContentForSave(name, pageId)

      await http.put<Record<string, unknown>>(
        `${getPageApi()}/${encodeURIComponent(pageId)}/${name}`,
        content,
        { headers: { 'Content-Type': 'text/plain' } },
      )

      finalizePageFileSaved(name, content)

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
      if (fileDirty[name]) {
        await savePageFile(name)
      }
    }
  }

  async function flushDirtyScopes(): Promise<void> {
    if (navDirty.value) {
      await saveCurrentNavScope()
    }

    if (hasAnyFileDirty.value) {
      await saveAllDirtyPageFiles()
    }
  }

  async function ensureCurrentNavScopePersistedWhenClean(): Promise<void> {
    if (!navDirty.value && !hasAnyFileDirty.value) {
      await saveCurrentNavScope()
    }
  }

  async function saveAll() {
    await flushDirtyScopes()
    await ensureCurrentNavScopePersistedWhenClean()
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

  function syncActivePageContextByPath(path: string): void {
    const pageId = normalizePageIdFromPath(path)
    if (pageId && isConfigNodeKind(editForm.nodeKind)) {
      setActivePageContext(pageId, activePageId.value !== pageId)
      return
    }
    clearFiles()
  }

  function handlePathChange(val: string) {
    markNavDirty()
    syncActivePageContextByPath(val)
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
    syncActivePageContextByPath(editForm.path)
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

  // ── 工具 ──
  function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) as T }

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize() {
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
    // 文件编辑
    activePageId,
    editFiles,
    fileDirty,
    fileSaving,
    fileLoadState,
    pageRuleTree,
    pageRuleDocument,
    pageDataDocument,
    pageDataTool,
    pageScriptDocument,
    pageStyleDocument,
    pageDataSetError,

    // 页面列表
    pageList,

    // 状态
    statusMessages,
    linkProbeLoading,
    linkProbeInfo,
    aiPanelVisible,
    pageDataDesignerDirty,
    autoSaveStatus,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,
    getPageEditTransactionCount,
    getFileSnapshotCount,
    getFileHistoryCount,
    canPageEditTransactionBack,
    canPageEditTransactionForward,
    canFileHistoryBack,
    canFileHistoryForward,

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
    updatePageDataDocument,
    ensureLivePageDataTool,
    replaceLivePageData,
    mutateLivePageData,
    undoLivePageData,
    redoLivePageData,
    syncPageDataDocumentFromTool,
    createLiveEditModelAdapter,
    goFileHistoryBack,
    goFileHistoryForward,
    undoPageEditTransaction,
    redoPageEditTransaction,
    applyPageFiles,
    updatePageFile,
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
