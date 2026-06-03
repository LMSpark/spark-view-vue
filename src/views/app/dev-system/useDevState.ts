/**
 * DevSystem 全局共享状态 — 跨面板的响应式数据中心。
 *
 * 编辑能力是普通业务能力，只负责 DevSystem 的页面配置编辑。
 *
 * SSOT 设计：
 * - 页面 4 文件（rule / pagedata / script / style）的真源由配置页节点持有。
 * - Vue 层通过当前 ConfigPageNode 读取文本、状态、dirty、undo/redo 和工具模型。
 * - 导航树、节点表单、autoSave、版本 API 与页面 4 文件状态合一暴露。
 *
 * 页面生命周期由配置页节点覆盖；adapter 保留 UI 响应式映射、localStorage、
 * autoSave、refreshRoutes 和状态消息。
 */
import { ref, reactive, computed, getCurrentInstance, nextTick } from 'vue'
import { createAiRunAdapter, createAiToolApprovalBridge, refreshRoutes } from '@spark-view/spark-app'
import type { AiToolApprovalRequest, NavNodeKind, ProjectNodeData } from '@spark-view/spark-app'
import { useSparkComponent } from '@spark-view/spark-component'
import type { ToolApprovalDisplayItem } from '@spark-view/spark-component'
import {
  ProjectNodeTools,
  type PageNodeFileName,
  type PageNodeFileVersionSummary,
  type ProjectPageReference,
  type ProjectPageNodeSummary,
  type ProjectSummary,
} from '@spark-view/spark-project-model/project'
import type { NavigationNodeEditDto as ProjectNavigationNodeEditDto } from '@spark-view/spark-project-model/project'
import {
  runPageDesignAiSession,
  type PageDesignAiRunOptions,
} from '@/services/page-design-ai-runner'
import { createDevSystemProjectEditor } from '@/services/dev-system-project-editor'

export type DevPageFileName = Extract<PageNodeFileName, string>
export type DevPageFileVersionSummary = {
  [Key in keyof PageNodeFileVersionSummary]: PageNodeFileVersionSummary[Key]
}
export type PageConfigPageSummary = {
  [Key in keyof ProjectPageNodeSummary]: ProjectPageNodeSummary[Key]
}
export type NavigationNodeEditDto = {
  [Key in keyof ProjectNavigationNodeEditDto]: ProjectNavigationNodeEditDto[Key]
}
export type RunPageDesignAiOptions = {
  [Key in keyof PageDesignAiRunOptions]: PageDesignAiRunOptions[Key]
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

export type DevWorkspaceTab = 'props' | 'preview' | DevPageFileName

// ═══════════════════════════════════════════════════════════
// 共享状态工厂
// ═══════════════════════════════════════════════════════════

export function useDevState() {
  const editor = createDevSystemProjectEditor()
  const projectId = editor.project.projectId
  const pageFileNames = editor.getPageFileNames()
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
  const treeData = ref<ProjectNodeData[]>([])
  const navLoading = ref(false)
  const navSaving = ref(false)
  const navDirty = ref(false)
  const selectedNode = ref<ProjectNodeData | null>(null)
  const navEditDtoRevision = ref(0)
  const pageFilesRevision = ref(editor.revision)

  editor.subscribe(() => {
    pageFilesRevision.value = editor.revision
  })

  function getEditorActivePage(): ReturnType<typeof editor.getActivePage> {
    // navEditDto proxies a framework-free ProjectEditor model. Track only explicit
    // navigation DTO switches here; tying it to every editor revision creates
    // needless tab/render feedback in Vue.
    void navEditDtoRevision.value
    return editor.getActivePage()
  }

  function refreshNavEditDtoBindings(): void {
    navEditDtoRevision.value++
  }

  // ── 节点编辑表单（navEditDto：直接代理到 activePage.navigation）──
  const navEditDto = reactive({
    get id(): string { return getEditorActivePage()?.navigation.id ?? '' },
    set id(_v: string) {},
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
    get linkTarget(): NavigationNodeEditDto['linkTarget'] { return getEditorActivePage()?.navigation.linkTarget ?? 'iframe' },
    set linkTarget(v: NavigationNodeEditDto['linkTarget']) { const p = getActivePage(); if (p) { p.navigation.linkTarget = v; markNavDirty() } },
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

  // ── 页面文件状态（只经 ProjectEditor 访问）──
  const activePageId = ref('')
  const fileSaving = ref(false)

  function notifyPageFileChanged(pageId: string, filename: PageNodeFileName | '__created' | '__deleted' | '__bulk'): void {
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

  // ── SPARK AI tool approval bridge + current pageDesign entry ──
  const pageDesignAiAdapter = createAiRunAdapter()
  const pageDesignAiRunRevision = ref(0)
  const aiToolApprovals = createAiToolApprovalBridge()
  const aiToolApprovalRevision = ref(0)
  const pageDesignAiRunning = computed(() => {
    void pageDesignAiRunRevision.value
    return pageDesignAiAdapter.isRunning()
  })
  const aiToolApprovalPending = computed<readonly ToolApprovalDisplayItem[]>(() => {
    void aiToolApprovalRevision.value
    return aiToolApprovals.listPending().map(toToolApprovalDisplayItem)
  })

  aiToolApprovals.subscribe(() => {
    aiToolApprovalRevision.value += 1
  })

  // ── 编辑器状态同步 ───────────────────────────────────

  function syncNavFromEditor(): void {
    const snap = editor.readSnapshot()
    treeData.value = [...snap.treeData]
    pageList.value = [...snap.pageFeatures]
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

  function isDocumentDirty(name: PageNodeFileName): boolean {
    void pageFilesRevision.value
    const snap = editor.readSnapshot()
    return snap.dirtyFiles.has(name)
  }

  const hasAnyFileDirty = computed(() => pageFileNames.some((n) => isDocumentDirty(n)))
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
    const pageMeta = pageList.value.find((page: PageConfigPageSummary) => page.pageId === pageId)
    if (!pageMeta) return treeData.value.length === 0
    return ProjectNodeTools.isConfigNodeKind(pageMeta.nodeKind)
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
    refreshNavEditDtoBindings()
    return true
  }

  function clearFiles(): void {
    editor.clearActivePage()
    activePageId.value = ''
    persistActivePageId('')
    refreshNavEditDtoBindings()
  }

  // ═══════════════════════════════════════════════════════════
  // 导航树工具
  // ═══════════════════════════════════════════════════════════

  function isSystemRootDirectoryInTree(node: ProjectNodeData | null | undefined): boolean {
    return ProjectNodeTools.isSystemRootDirectory(node, treeData.value)
  }

  function canUseModuleNodeKindInTree(node: ProjectNodeData | null | undefined): boolean {
    return ProjectNodeTools.canUseModuleNodeKind(node, treeData.value)
  }

  function syncActivePageContextByPath(path: string): void {
    const pageId = ProjectNodeTools.resolvePageIdFromPath(path)
    if (pageId && ProjectNodeTools.isConfigNodeKind(navEditDto.nodeKind)) {
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

  function previewApprovalArgs(args: AiToolApprovalRequest['args']): string {
    try {
      const text = JSON.stringify(args, null, 2)
      return text.length > 600 ? `${text.slice(0, 600)}...` : text
    } catch {
      return String(args)
    }
  }

  function toToolApprovalDisplayItem(request: AiToolApprovalRequest): ToolApprovalDisplayItem {
    return {
      id: request.id,
      toolName: request.toolName,
      moduleId: request.moduleId,
      argsPreview: previewApprovalArgs(request.args),
    }
  }

  function approveAiTool(requestId: string): void {
    if (!aiToolApprovals.decide(requestId, { status: 'allow' })) return
    addStatus('AI 工具调用已允许', 'info')
  }

  function rejectAiTool(requestId: string, reason: string): void {
    const normalizedReason = reason.trim()
    if (!aiToolApprovals.decide(requestId, {
      status: 'reject',
      reason: normalizedReason || '用户拒绝工具调用',
      fix: '请根据用户拒绝原因调整方案；必要时先询问用户。',
    })) return
    addStatus('AI 工具调用已拒绝', 'warning')
  }

  function abortAiTool(requestId: string, reason: string): void {
    const normalizedReason = reason.trim()
    if (!aiToolApprovals.decide(requestId, {
      status: 'abort',
      reason: normalizedReason || '用户中止工具调用',
    })) return
    addStatus('AI 工具调用已中止', 'warning')
  }

  async function runPageDesignAi(options: PageDesignAiRunOptions): Promise<void> {
    const pageId = activePageId.value.trim()
    const description = options.description.trim()
    if (!pageId) {
      addStatus('请先选择一个配置页面', 'warning')
      return
    }
    if (!description) {
      addStatus('请先输入 AI 编辑需求', 'warning')
      return
    }
    if (pageDesignAiAdapter.isRunning()) return

    pageDesignAiRunRevision.value += 1
    await nextTick()

    try {
      addStatus(`AI 开始编辑页面 ${pageId}`, 'info')
      const result = await runPageDesignAiSession({
        ...options,
        pageId,
        editor,
        consumeCapability: capabilityConsumer,
        adapter: pageDesignAiAdapter,
        beforeFunctionCall: aiToolApprovals.beforeFunctionCall,
        onAbort: aiToolApprovals.cancelPending,
        events: {
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
      aiToolApprovals.cancelPending('AI 编辑会话已结束。')
      pageDesignAiRunRevision.value += 1
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
    } catch (error) {
      syncNavFromEditor()
      addStatus(`导航加载失败: ${String(error)}`, 'error')
    } finally {
      navLoading.value = false
    }

    if (preservedSelectedNodeId) {
      const matchedNode = ProjectNodeTools.findNodeById(treeData.value, preservedSelectedNodeId)
      if (matchedNode) {
        selectedNode.value = matchedNode
        loadNodeToForm(matchedNode)
        await syncPageFilesForNodeAfterLoad(matchedNode, false)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = ProjectNodeTools.findPageNodeByPageId(treeData.value, preservedActivePageId)
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

  async function syncPageFilesForNodeAfterLoad(node: ProjectNodeData, forceReload: boolean): Promise<void> {
    const pageId = ProjectNodeTools.resolvePageNodePageId(node)
    if (pageId && ProjectNodeTools.isConfigNodeKind(node.nodeKind ?? 'page')) {
      await editor.selectPage(pageId, { forceReload })
      activePageId.value = editor.readSnapshot().pageId
      persistActivePageId(pageId)
      return
    }
    clearFiles()
  }

  function syncEditorActivePageFromState(): boolean {
    const pageId = activePageId.value
    if (!pageId) return false
    if (editor.getActivePage()?.pageId !== pageId) {
      editor.setActivePage(pageId)
    }
    return true
  }

  async function ensureActivePageFilesLoaded(options?: { forceReload?: boolean }): Promise<void> {
    if (!syncEditorActivePageFromState()) return
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload !== undefined) loadOptions.forceReload = options.forceReload
    await editor.ensureActivePageFilesLoaded(loadOptions)
  }

  async function loadPageFile(name: PageNodeFileName, options?: { forceReload?: boolean }): Promise<void> {
    if (!syncEditorActivePageFromState()) return
    await editor.loadPageFile(name, options)
  }

  function getPageFileText(name: PageNodeFileName): string {
    void pageFilesRevision.value
    return editor.getPageFileText(name)
  }

  // ═══════════════════════════════════════════════════════════
  // 页面文件版本
  // ═══════════════════════════════════════════════════════════

  async function listRemotePageVersions(filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    if (!activePageId.value) return []
    editor.setActivePage(activePageId.value)
    try {
      return await editor.listRemotePageVersions(filename)
    } catch (e) {
      addStatus(`读取后端版本失败: ${String(e)}`, 'error')
      return []
    }
  }

  async function restoreRemotePageVersion(version: number, filename: PageNodeFileName): Promise<boolean> {
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

  async function createRemotePageVersion(filename: PageNodeFileName): Promise<boolean> {
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

  async function deleteRemotePageVersion(version: number, filename: PageNodeFileName): Promise<boolean> {
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

  function loadNodeToForm(node: ProjectNodeData): void {
    const pageId = ProjectNodeTools.resolvePageNodePageId(node) || node.id || `nav-node-${node.id}`
    editor.setActivePage(pageId)
    const page = editor.getActivePage()
    if (page) {
      page.navigation.loadFromNode(node)
      contextItems.value = [...page.navigation.contextItems]
      Object.assign(contextConfig, page.navigation.contextConfig)
    }
    navDirty.value = false
    linkProbeInfo.value = null
    refreshNavEditDtoBindings()
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

    if (navEditDto.nodeKind === 'module' && !canUseModuleNodeKindInTree(node)) {
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

  async function savePageFile(name: PageNodeFileName): Promise<void> {
    const pageId = activePageId.value
    if (!pageId) return

    fileSaving.value = true
    try {
      editor.setActivePage(pageId)
      await editor.savePageFile(name)
      addStatus(`页面 ${pageId} 已保存 ${name}`, 'success')
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
      syncNavFromEditor()

      navEditDto.path = `/${pageId}`
      navEditDto.title = params.title
      navEditDto.icon = params.icon
      handlePathChange(`/${pageId}`)

      notifyPageFileChanged(pageId, '__created')
      await editor.selectPage(pageId)
      activePageId.value = editor.readSnapshot().pageId
      persistActivePageId(pageId)
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
    navDirty.value = false
    addStatus('未选中节点，无需保存导航属性', 'info')
  }

  async function saveAllDirtyPageFiles(): Promise<void> {
    for (const name of pageFileNames) {
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

  async function selectNode(node: ProjectNodeData): Promise<void> {
    cancelAutoSave()
    if (navDirty.value && selectedNode.value) void saveNodeChanges()
    selectedNode.value = node
    editor.selectNode(node.id)
    try {
      const pageId = ProjectNodeTools.resolvePageNodePageId(node)
      if (pageId && ProjectNodeTools.isConfigNodeKind(node.nodeKind ?? 'page')) {
        await editor.selectPage(pageId)
        activePageId.value = editor.readSnapshot().pageId
        persistActivePageId(pageId)
      } else {
        clearFiles()
        // Keep a navigation edit context for non-page nodes; this is not a pageModel.
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
    syncActivePageContextByPath(navEditDto.path)
  }

  // ═══════════════════════════════════════════════════════════
  // 链接探测
  // ═══════════════════════════════════════════════════════════

  function onLinkUrlChanged(): void {
    markNavDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkTarget(): Promise<void> {
    const url = navEditDto.path.trim()
    if (!url) {
      addStatus('请先输入超链接地址', 'warning')
      return
    }

    linkProbeLoading.value = true
    try {
      const result = await editor.probeLink(url)
      const embeddable = result.embeddable
      const reason = result.reason

      navEditDto.linkTarget = embeddable ? 'iframe' : 'new-tab'
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

  async function listReferenceProjects(): Promise<ProjectSummary[]> {
    return editor.listReferenceProjects()
  }

  async function listReferenceProjectPages(targetProjectId: string): Promise<ProjectPageReference[]> {
    return editor.listReferenceProjectPages(targetProjectId)
  }

  // ═══════════════════════════════════════════════════════════
  // 树增删
  // ═══════════════════════════════════════════════════════════

  function addRootNode(): void {
    const node = ProjectNodeTools.createRootModuleNode(() => crypto.randomUUID())
    void editor.addNavigationNode({ node }).then(
      (created) => {
        selectedNode.value = created
        syncNavFromEditor()
        addStatus('已添加根模块', 'info')
      },
      (e: unknown) => {
        void editor.loadNavigation().then(() => syncNavFromEditor())
        addStatus(`添加模块失败: ${String(e)}`, 'error')
      },
    )
  }

  function hasReservedRootGroup(placement: 'toolbar' | 'user-menu'): boolean {
    return treeData.value.some((node) => node.childPlacement === placement)
  }

  function getReservedRootGroupTemplate(placement: 'toolbar' | 'user-menu'): ProjectNodeData {
    return ProjectNodeTools.createReservedRootGroup(placement, {
      createId: () => crypto.randomUUID(),
    })
  }

  async function restoreReservedRootGroup(placement: 'toolbar' | 'user-menu'): Promise<void> {
    if (hasReservedRootGroup(placement)) {
      addStatus(`${placement} 已存在，无需恢复`, 'info')
      return
    }

    const node = getReservedRootGroupTemplate(placement)
    try {
      await editor.addNavigationNode({ node, index: 0 })
      syncNavFromEditor()
      addStatus(`已恢复 ${node.title}`, 'success')
    } catch (e) {
      await editor.loadNavigation()
      syncNavFromEditor()
      addStatus(`恢复失败: ${String(e)}`, 'error')
    }
  }

  async function addChildNode(parent: ProjectNodeData): Promise<void> {
    const pageId = ProjectNodeTools.resolvePageIdFromPath(`/child-${crypto.randomUUID().slice(0, 8)}`)
    try {
      await editor.createMountedPage({
        pageId,
        parentId: parent.id,
        rollbackPageOnNavigationFailure: true,
      })
      syncNavFromEditor()
      await refreshRoutes()
      addStatus(`已在 ${parent.title} 下添加子节点`, 'info')
    } catch (e) {
      addStatus(`添加节点失败: ${String(e)}`, 'error')
    }
  }

  function removeNodeFromTree(_node: { parent: { data: ProjectNodeData } }, data: ProjectNodeData): void {
    if (isSystemRootDirectoryInTree(data)) {
      addStatus(`系统目录 ${data.title} 不可删除，仅可编辑子项`, 'warning')
      return
    }
    const pageId = ProjectNodeTools.resolvePageNodePageId(data)
    const shouldRemoveMountedPage = pageId.length > 0 && ProjectNodeTools.isConfigNodeKind(data.nodeKind ?? 'page')
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

  async function moveNodeInTree(data: ProjectNodeData): Promise<void> {
    if (isSystemRootDirectoryInTree(data)) return
    const location = ProjectNodeTools.findNodeLocation(treeData.value, data.id)
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
    navEditDto.hasContext = true
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
  // 工具访问（委托当前 ConfigPageNode）
  // ═══════════════════════════════════════════════════════════

  function editDataSet(
    run: Parameters<NonNullable<ReturnType<typeof editor.getActivePage>>['editDataSet']>[0],
  ): Promise<void> {
    const page = getActivePage()
    if (!page) {
      return Promise.reject(new Error('无活动页面，无法编辑数据集'))
    }
    return page.editDataSet(run)
  }

  function getDataSetTool(): ReturnType<NonNullable<ReturnType<typeof editor.getActivePage>>['getDataSetTool']> | null {
    void pageFilesRevision.value
    return getActivePage()?.getDataSetTool() ?? null
  }

  function editNodeTree(
    run: Parameters<NonNullable<ReturnType<typeof editor.getActivePage>>['editNodeTree']>[0],
  ): Promise<void> {
    const page = getActivePage()
    if (!page) {
      return Promise.reject(new Error('无活动页面，无法编辑节点树'))
    }
    return page.editNodeTree(run)
  }

  function getNodeTree(): ReturnType<NonNullable<ReturnType<typeof editor.getActivePage>>['getNodeTree']> | null {
    void pageFilesRevision.value
    return getActivePage()?.getNodeTree() ?? null
  }

  function setRuleText(text: string): void {
    const page = getActivePage()
    if (!page) return
    page.rule.setText(text)
    notifyPageFileChanged(page.pageId, 'rule.json')
  }

  function setDataSetText(text: string): void {
    const page = getActivePage()
    if (!page) return
    page.dataSet.setText(text)
    notifyPageFileChanged(page.pageId, 'pagedata.json')
  }

  function undoRule(): boolean {
    const page = getActivePage()
    if (!page) return false
    const ok = page.rule.undo()
    if (ok) notifyPageFileChanged(page.pageId, 'rule.json')
    return ok
  }

  function redoRule(): boolean {
    const page = getActivePage()
    if (!page) return false
    const ok = page.rule.redo()
    if (ok) notifyPageFileChanged(page.pageId, 'rule.json')
    return ok
  }

  function undoDataSet(): boolean {
    const page = getActivePage()
    if (!page) return false
    const ok = page.dataSet.undo()
    if (ok) notifyPageFileChanged(page.pageId, 'pagedata.json')
    return ok
  }

  function redoDataSet(): boolean {
    const page = getActivePage()
    if (!page) return false
    const ok = page.dataSet.redo()
    if (ok) notifyPageFileChanged(page.pageId, 'pagedata.json')
    return ok
  }

  function getActivePage(): ReturnType<typeof editor.getActivePage> {
    return editor.getActivePage()
  }

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize(): Promise<void> {
    const persistedActivePageId = readPersistedActivePageId()
    await loadNavConfig({ preserveActivePageId: persistedActivePageId })
  }

  return {
    // 导航树
    projectId,
    treeData,
    navLoading,
    navSaving,
    navDirty,
    selectedNode,

    // 编辑表单（navEditDto 直接代理到 activePage.navigation）
    navEditDto,
    contextItems,
    contextConfig,

    // 空导航状态
    navEmpty,

    // 页面 4 文件
    pageFileNames,
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
    aiToolApprovalPending,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,
    isDocumentDirty,

    notifyPageFileChanged,

    // 方法
    addStatus,
    loadNavConfig,
    loadPageFile,
    ensureActivePageFilesLoaded,
    getPageFileText,
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
    saveNodeChanges,
    saveAll,
    runPageDesignAi,
    approveAiTool,
    rejectAiTool,
    abortAiTool,
    selectNode,
    handlePathChange,
    handleNodeKindChange,
    addRootNode,
    hasReservedRootGroup,
    isSystemRootDirectory: isSystemRootDirectoryInTree,
    restoreReservedRootGroup,
    canUseModuleNodeKind: canUseModuleNodeKindInTree,
    addChildNode,
    listReferenceProjects,
    listReferenceProjectPages,
    removeNodeFromTree,
    moveNodeInTree,
    toggleContext,
    addContextItem,
    removeContextItem,
    fillDemoContext,
    syncContextToNav,
    getDataSetTool,
    editDataSet,
    editNodeTree,
    getNodeTree,
    setRuleText,
    setDataSetText,
    undoRule,
    redoRule,
    undoDataSet,
    redoDataSet,
    getActivePage,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
