/**
 * DevSystem — **当前登录项目**的导航设计器状态。
 *
 * 本质：经 APP 门面实例编辑 `editor.project`（ProjectModel 领域实例）中的导航树与配置页
 * 内容。不是独立「文件系统」，而是同一领域实例在壳层的 Vue 投影。
 *
 * - `editor` = `getAppProjectEditor()`（**门面实例**；领域真源在 `editor.project`）
 * - 导航树 / 节点表单 / dirty：经门面 API + `readSnapshot()` 投影到 Vue ref
 * - 配置页内容：`state.editor.*`（setPageFileText、editDataSet、save…）
 * - 本模块只编排：Vue ref、localStorage 活动页、autoSave、SSE、状态消息
 */
import { ref, reactive, computed, getCurrentInstance, nextTick } from 'vue'
import { createAiRunAdapter, createAiToolApprovalBridge, getNavTree } from '@spark-appworks/spark-app'
import type { AiToolApprovalRequest, NavNodeKind, ProjectNodeData } from '@spark-appworks/spark-app'
import { useSparkComponent } from '@spark-appworks/spark-component'
import type { ToolApprovalDisplayItem } from '@spark-appworks/spark-component'
import {
  isConfigFilesPageSurface,
  isConfigNodeKind,
  findNodeById,
  findPageNodeByPageId,
  findNodeLocation,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  createRootModuleNode,
  createReservedRootGroup,
  type ProjectNodeLocation,
  type PageNodeFileName,
  type ProjectPageNodeSummary,
} from '@spark-appworks/spark-project-model'
import type {
  NavigationNodeEditInputDto,
  NavigationNodeEditDto as ProjectNavigationNodeEditDto,
  ProjectPageReference,
  ProjectSummary,
} from '@spark-appworks/spark-project-model/project'
import {
  runPageDesignAiSession,
  type PageDesignAiRunOptions,
} from '@/services/page-design-ai-runner'
import { getAppProjectEditor } from '@/services/project-editor-host'
import { reloadAndSyncNavigation, syncCommittedNavigationFromRouter } from '@/services/navigation-sync'

export type DevPageFileName = Extract<PageNodeFileName, string>
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
  const editor = getAppProjectEditor()
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

  // ── 导航树（readSnapshot 投影，非独立真源）──
  const navLoading = ref(false)
  const navSaving = ref(false)
  const navEditDtoRevision = ref(0)
  const pageFilesRevision = ref(editor.revision)

  function readNavSnapshot() {
    void pageFilesRevision.value
    return editor.readSnapshot()
  }

  const treeData = computed(() => readNavSnapshot().treeData)
  const pageList = computed(() => readNavSnapshot().pageFeatures)
  const selectedNode = computed(() => readNavSnapshot().selectedNode)
  const navEmpty = computed(() => readNavSnapshot().treeData.length === 0)
  const activePageId = computed(() => readNavSnapshot().pageId)

  editor.subscribe(() => {
    pageFilesRevision.value = editor.revision
    refreshNavEditDtoBindings()
  })

  function refreshNavEditDtoBindings(): void {
    navEditDtoRevision.value++
  }

  function readNavEditDto(): NavigationNodeEditInputDto | null {
    void navEditDtoRevision.value
    return editor.navigationEditDto
  }

  // ── 节点编辑表单（navEditDto：代理到 editor.navigationEditDto 工作副本）──
  const navEditDto = reactive({
    get id(): string { return readNavEditDto()?.node.id ?? '' },
    set id(_v: string) {},
    get title(): string { return readNavEditDto()?.node.title ?? '' },
    set title(v: string) { const dto = editor.navigationEditDto; if (dto) { dto.node.title = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get icon(): string { return readNavEditDto()?.node.icon ?? '' },
    set icon(v: string) { const dto = editor.navigationEditDto; if (dto) { dto.node.icon = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get nodeKind(): NavNodeKind { return readNavEditDto()?.node.nodeKind ?? 'page' },
    set nodeKind(v: NavNodeKind) { const dto = editor.navigationEditDto; if (dto) { dto.node.nodeKind = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get dividerAfter(): boolean { return readNavEditDto()?.node.dividerAfter ?? false },
    set dividerAfter(v: boolean) { const dto = editor.navigationEditDto; if (dto) { dto.node.dividerAfter = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get description(): string { return readNavEditDto()?.node.description ?? '' },
    set description(v: string) { const dto = editor.navigationEditDto; if (dto) { dto.node.description = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get path(): string { return readNavEditDto()?.node.path ?? '' },
    set path(v: string) { const dto = editor.navigationEditDto; if (dto) { dto.node.path = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get linkTarget(): NavigationNodeEditDto['linkTarget'] { return readNavEditDto()?.node.linkTarget ?? 'iframe' },
    set linkTarget(v: NavigationNodeEditDto['linkTarget']) { const dto = editor.navigationEditDto; if (dto) { dto.node.linkTarget = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get childPlacement(): string { return readNavEditDto()?.node.childPlacement ?? '' },
    set childPlacement(v: string) { const dto = editor.navigationEditDto; if (dto) { dto.node.childPlacement = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get order(): number { return readNavEditDto()?.node.order ?? 0 },
    set order(v: number) { const dto = editor.navigationEditDto; if (dto) { dto.node.order = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get hidden(): boolean { return readNavEditDto()?.node.hidden ?? false },
    set hidden(v: boolean) { const dto = editor.navigationEditDto; if (dto) { dto.node.hidden = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get disabled(): boolean { return readNavEditDto()?.node.disabled ?? false },
    set disabled(v: boolean) { const dto = editor.navigationEditDto; if (dto) { dto.node.disabled = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get refId(): string { return readNavEditDto()?.node.refId ?? '' },
    set refId(v: string) { const dto = editor.navigationEditDto; if (dto) { dto.node.refId = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get permissionMode(): 'none' | 'masked' | 'invisible' { return readNavEditDto()?.node.permissionMode ?? 'masked' },
    set permissionMode(v: 'none' | 'masked' | 'invisible') { const dto = editor.navigationEditDto; if (dto) { dto.node.permissionMode = v; editor.applyNavigationEditDto(dto); markNavDirty() } },
    get hasContext(): boolean { return readNavEditDto()?.context.hasContext ?? false },
    set hasContext(v: boolean) {
      const dto = editor.navigationEditDto
      if (dto) {
        dto.context.hasContext = v
        if (!v) { dto.context.items = [] }
        editor.applyNavigationEditDto(dto)
        markNavDirty()
      }
    },
  })
  /** 模块上下文表单 — 代理到 editor.navigationEditDto.context（与 navEditDto 同模式）。 */
  const contextEdit = reactive({
    get items(): Array<{ id: string; title: string }> {
      void navEditDtoRevision.value
      return editor.navigationEditDto?.context.items ?? []
    },
    get placeholder(): string { return readNavEditDto()?.context.config.placeholder ?? '' },
    set placeholder(v: string) {
      const dto = editor.navigationEditDto
      if (!dto) return
      dto.context.config.placeholder = v
      editor.applyNavigationEditDto(dto)
      markNavDirty()
    },
    get defaultValue(): string { return readNavEditDto()?.context.config.defaultValue ?? '' },
    set defaultValue(v: string) {
      const dto = editor.navigationEditDto
      if (!dto) return
      dto.context.config.defaultValue = v
      editor.applyNavigationEditDto(dto)
      markNavDirty()
    },
    get paramName(): string { return readNavEditDto()?.context.config.paramName ?? '' },
    set paramName(v: string) {
      const dto = editor.navigationEditDto
      if (!dto) return
      dto.context.config.paramName = v
      editor.applyNavigationEditDto(dto)
      markNavDirty()
    },
  })

  // ── 页面文件状态（只经 ProjectEditor 访问）──
  const pageIoBusy = ref(false)

  function bumpPageCache(
    pageId: string,
    filename: PageNodeFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    editor.notifyPageFileChanged(pageId, filename)
  }

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

  // ═══════════════════════════════════════════════════════════
  // 计算属性
  // ═══════════════════════════════════════════════════════════

  const hasAnyFileDirty = computed(() => {
    void pageFilesRevision.value
    const dirty = editor.readSnapshot().dirtyFiles
    return pageFileNames.some((n) => dirty.has(n))
  })

  const navDirty = computed(() => {
    void pageFilesRevision.value
    return editor.readSnapshot().navigationDirty
  })

  const hasAnyDirty = computed(() => {
    void pageFilesRevision.value
    return editor.readSnapshot().hasAnyDirty
  })

  const pageDataDirty = computed(() => {
    void pageFilesRevision.value
    return editor.readSnapshot().dirtyFiles.has('pagedata.json')
  })
  const pageDataError = computed(() => {
    void pageFilesRevision.value
    return editor.readSnapshot().parseErrors['pagedata.json']
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
    const pageMeta = pageList.value.find((page: PageConfigPageSummary) => page.pageId === pageId)
    if (!pageMeta) return treeData.value.length === 0
    return isConfigFilesPageSurface(pageMeta.designSurface)
  }

  // ═══════════════════════════════════════════════════════════
  // 页面上下文切换
  // ═══════════════════════════════════════════════════════════

  function setActivePageContext(pageId: string, forceReset = false): boolean {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId || !isBackendConfigPage(normalizedPageId)) {
      clearActivePageContext()
      return false
    }

    const shouldReset = forceReset || activePageId.value !== normalizedPageId
    editor.setActivePage(normalizedPageId, { forceReset: shouldReset })
    persistActivePageId(normalizedPageId)
    return true
  }

  function clearActivePageContext(): void {
    editor.clearActivePage()
    persistActivePageId('')
  }

  // ═══════════════════════════════════════════════════════════
  // 导航树工具
  // ═══════════════════════════════════════════════════════════

  function isSystemRootDirectoryInTree(node: ProjectNodeData | null | undefined): boolean {
    return isSystemRootDirectory(node, treeData.value)
  }

  function canUseModuleNodeKindInTree(node: ProjectNodeData | null | undefined): boolean {
    return canUseModuleNodeKind(node, treeData.value)
  }

  function syncActivePageContextByPath(path: string): void {
    const pageId = normalizePageIdFromPath(path)
    if (pageId && isConfigNodeKind(navEditDto.nodeKind)) {
      setActivePageContext(pageId, activePageId.value !== pageId)
      return
    }
    clearActivePageContext()
  }

  function applyNodeKindPreset(kind: NavNodeKind): void {
    editor.applyNodeKindPreset(kind)
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
            const type: StatusMessage['type'] = record.status === 'success' ? 'info' : 'warning'
            addStatus(`AI 工具 ${record.toolName} ${record.status === 'success' ? '完成' : '失败'}`, type)
          },
        },
      })
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

  async function ensureCurrentProjectNavigationLoaded(): Promise<void> {
    if (editor.readSnapshot().treeData.length > 0) return

    const navFromRouter = getNavTree()
    if (navFromRouter && navFromRouter.children.length > 0) {
      syncCommittedNavigationFromRouter()
      return
    }

    await editor.loadNavigation()
  }

  async function loadNavConfig(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }): Promise<void> {
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.id ?? null
    const preservedActivePageId = options?.preserveActivePageId?.trim() ?? ''
    navLoading.value = true
    try {
      await ensureCurrentProjectNavigationLoaded()
      refreshNavEditDtoBindings()
      addStatus(`项目 ${projectId} 导航已就绪`, 'success')
    } catch (error) {
      addStatus(`导航加载失败: ${String(error)}`, 'error')
    } finally {
      navLoading.value = false
    }

    const snapTree = readNavSnapshot().treeData

    if (preservedSelectedNodeId) {
      const matchedNode = findNodeById(snapTree, preservedSelectedNodeId)
      if (matchedNode) {
        await selectNode(matchedNode)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = findPageNodeByPageId(snapTree, preservedActivePageId)
      if (matchedNode) {
        await selectNode(matchedNode)
        return
      }

      if (setActivePageContext(preservedActivePageId, false)) {
        editor.selectNode(null)
        linkProbeInfo.value = null
        return
      }
    }

    if (snapTree.length === 0) {
      editor.selectNode(null)
      clearActivePageContext()
      return
    }

    const firstNode = snapTree[0]
    if (firstNode) {
      await selectNode(firstNode)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点表单
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: ProjectNodeData): void {
    const pageId = resolvePageNodePageId(node) || node.id || `nav-node-${node.id}`
    editor.setActivePage(pageId)
    editor.selectNode(node.id)
    editor.beginNavigationEdit()
    linkProbeInfo.value = null
  }

  function applyNavChanges(): void {
    if (!selectedNode.value) return
    const node = selectedNode.value
    if (isSystemRootDirectoryInTree(node)) {
      loadNodeToForm(node)
      addStatus(`系统目录 ${node.title} 不可修改目录属性，仅可编辑子项`, 'warning')
      return
    }

    if (navEditDto.nodeKind === 'module' && !canUseModuleNodeKindInTree(node)) {
      applyNodeKindPreset('page')
      addStatus('页面下不能创建模块，已自动改为普通页面', 'warning')
    }

    const dto = editor.navigationEditDto
    if (dto) {
      const result = editor.applyNavigationEditDto(dto)
      for (const warning of result.warnings) {
        addStatus(warning, 'warning')
      }
    }
  }

  function markNavDirty(): void {
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
    if (!editor.readSnapshot().navigationDirty) { autoSaveStatus.value = 'idle'; return }
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
      addStatus(`系统目录 ${node.title} 仅允许编辑子项，跳过节点保存`, 'warning')
      return true
    }

    navSaving.value = true
    try {
      editor.selectNode(node.id)
      await editor.saveSelectedNavigationNode({ skipReload: true })
      await reloadAndSyncNavigation()
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
      clearActivePageContext()
      addStatus(`页面 ${pageId} 为 vue-component，不提供后端配置文件编辑`, 'warning')
      return
    }
    setActivePageContext(pageId, activePageId.value !== pageId)
  }

  async function createPageForSelectedNode(params: { pageId: string; title: string; icon: string }): Promise<boolean> {
    const pageId = params.pageId.trim()
    if (!pageId || !selectedNode.value) return false

    pageIoBusy.value = true
    try {
      await editor.createPageForSelectedNode({
        pageId,
        title: params.title,
        icon: params.icon,
      })

      navEditDto.path = `/${pageId}`
      navEditDto.title = params.title
      navEditDto.icon = params.icon
      handlePathChange(`/${pageId}`)

      bumpPageCache(pageId, '__created')
      await editor.selectPage(pageId)
      persistActivePageId(pageId)
      return true
    } catch (e) {
      addStatus(`创建页面失败: ${String(e)}`, 'error')
      return false
    } finally {
      pageIoBusy.value = false
    }
  }

  async function saveCurrentNavScope(): Promise<void> {
    if (selectedNode.value) {
      await saveNodeChanges()
      return
    }
    addStatus('未选中节点，无需保存导航属性', 'info')
  }

  async function saveAllDirtyPageFiles(): Promise<void> {
    const pageId = activePageId.value
    if (!pageId) return
    editor.setActivePage(pageId)
    for (const name of pageFileNames) {
      if (!editor.readSnapshot().dirtyFiles.has(name)) continue
      pageIoBusy.value = true
      try {
        await editor.savePageFile(name)
        addStatus(`页面 ${pageId} 已保存 ${name}`, 'success')
      } catch (e) {
        addStatus(`保存 ${name} 失败: ${String(e)}`, 'error')
      } finally {
        pageIoBusy.value = false
      }
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
    editor.selectNode(node.id)
    try {
      const pageId = resolvePageNodePageId(node)
      if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
        await editor.selectPage(pageId)
        persistActivePageId(pageId)
      } else {
        clearActivePageContext()
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
    const node = createRootModuleNode(() => crypto.randomUUID())
    void editor.addNavigationNode({ node }).then(
      () => {
        addStatus('已添加根模块', 'info')
      },
      (e: unknown) => {
        void editor.loadNavigation()
        addStatus(`添加模块失败: ${String(e)}`, 'error')
      },
    )
  }

  function hasReservedRootGroup(placement: 'toolbar' | 'user-menu'): boolean {
    return treeData.value.some((node) => node.childPlacement === placement)
  }

  function getReservedRootGroupTemplate(placement: 'toolbar' | 'user-menu'): ProjectNodeData {
    return createReservedRootGroup(placement, {
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
      addStatus(`已恢复 ${node.title}`, 'success')
    } catch (e) {
      await editor.loadNavigation()
      addStatus(`恢复失败: ${String(e)}`, 'error')
    }
  }

  async function addChildNode(parent: ProjectNodeData): Promise<void> {
    const pageId = normalizePageIdFromPath(`/child-${crypto.randomUUID().slice(0, 8)}`)
    try {
      await editor.createMountedPage({
        pageId,
        parentId: parent.id,
        rollbackPageOnNavigationFailure: true,
      })
      await reloadAndSyncNavigation()
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
    const pageId = resolvePageNodePageId(data)
    const shouldRemoveMountedPage = pageId.length > 0 && isConfigNodeKind(data.nodeKind ?? 'page')
    const deletePromise = shouldRemoveMountedPage
      ? editor.removeMountedPage({ pageId, nodeId: data.id })
      : editor.deleteNode(data.id)
    void deletePromise.then(
      () => {
        if (selectedNode.value?.id === data.id) {
          editor.selectNode(null)
          clearActivePageContext()
        }
        if (shouldRemoveMountedPage) {
          bumpPageCache(pageId, '__deleted')
        }
        addStatus(`已删除 ${data.title}`, 'info')
      },
      (e: unknown) => {
        addStatus(`删除节点失败: ${String(e)}`, 'error')
      },
    )
  }

  async function moveNodeInTree(data: ProjectNodeData): Promise<void> {
    if (isSystemRootDirectoryInTree(data)) return
    const location: ProjectNodeLocation | null = findNodeLocation(treeData.value, data.id)
    if (!location) return
    navSaving.value = true
    try {
      await editor.moveMountedPage(data.id, location.parentId, location.index)
      await reloadAndSyncNavigation()
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
    const dto = editor.navigationEditDto
    if (val && dto?.context.items.length === 0) {
      dto.context.items.push({ id: '', title: '' })
      editor.applyNavigationEditDto(dto)
    }
    navEditDto.hasContext = val
  }
  function addContextItem(): void {
    const dto = editor.navigationEditDto
    if (!dto) return
    dto.context.items.push({ id: '', title: '' })
    editor.applyNavigationEditDto(dto)
    markNavDirty()
  }
  function removeContextItem(idx: number): void {
    const dto = editor.navigationEditDto
    if (!dto) return
    dto.context.items.splice(idx, 1)
    editor.applyNavigationEditDto(dto)
    markNavDirty()
  }
  function fillDemoContext(): void {
    navEditDto.hasContext = true
    const dto = editor.navigationEditDto
    if (!dto) return
    dto.context.items = DEMO_CONTEXT_ITEMS.map(item => ({ ...item }))
    Object.assign(dto.context.config, DEMO_CONTEXT_CONFIG)
    editor.applyNavigationEditDto(dto)
    markNavDirty()
    addStatus('已填充模块上下文演示数据', 'info')
  }

  /** 选项 id/title 就地编辑后提交到 DTO。 */
  function commitContextEdit(): void {
    const dto = editor.navigationEditDto
    if (!dto) return
    editor.applyNavigationEditDto(dto)
    markNavDirty()
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

    // 编辑表单（navEditDto 代理到 editor.navigationEditDto 工作副本）
    navEditDto,
    contextEdit,

    // 空导航状态
    navEmpty,

    // 页面 4 文件
    pageFileNames,
    activePageId,
    pageIoBusy,
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

    editor,

    // 方法
    addStatus,
    loadNavConfig,
    clearActivePageContext,
    selectPage,
    createPageForSelectedNode,
    onLinkUrlChanged,
    probeLinkTarget,
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
    commitContextEdit,
    initialize,
  }
}

export type DevState = ReturnType<typeof useDevState>
