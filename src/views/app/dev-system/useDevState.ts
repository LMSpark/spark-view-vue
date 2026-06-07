/**
 * DevSystem — 当前编辑 scope 的导航设计器状态。
 *
 * 本质：经 `ProjectModel` 领域实例编辑 `{ tenantId, projectId }` 指向的项目模型。
 * 它可以是当前运行项目，也可以是被委托编辑的其他租户项目。
 *
 * - `workspace` = `getAppProjectWorkspace(scope)`；领域真源在 `workspace.project`
 * - `project` = `workspace.project`（ProjectModel；API、事件、revision、projection）
 * - 导航树 / 节点表单 / dirty：经模型 API + 显式投影 API 到 Vue ref
 * - 配置页内容：写入走 `project.writePageFile()`，保存/版本走 ProjectWorkspace
 * - 本模块只编排：Vue ref、localStorage 活动页、autoSave、SSE、状态消息
 */
import { ref, shallowRef, reactive, computed, getCurrentInstance, getCurrentScope, nextTick, onScopeDispose } from 'vue'
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
  PAGE_NODE_FILE_NAMES,
  type ProjectModel,
  type ProjectNodeLocation,
  type PageNodeFileName,
  type ProjectPageNodeSummary,
  type NavigationNodeDraft,
  type NavigationNodeDraftNode as ProjectNavigationNodeDraftNode,
} from '@spark-appworks/spark-project-model'
import type {
  ProjectWorkspace,
  ProjectPageReference,
  ProjectSummary,
} from '@spark-appworks/spark-project-model'
import {
  runPageDesignAiSession,
  type PageDesignAiRunOptions,
} from '@/services/page-design-ai-runner'
import { getAppProjectWorkspace } from '@/services/project-workspace'
import type { ProjectWorkspaceScope } from '@/services/project-workspace'
import { reloadAndSyncNavigation, syncCommittedNavigationFromRouter } from '@/services/navigation-sync'
import { getUser } from '@/services/auth'
import { getProjectApi } from '@/services/api-paths'
import { http } from '@/services/http'

export type DevPageFileName = Extract<PageNodeFileName, string>
export type PageConfigPageSummary = {
  [Key in keyof ProjectPageNodeSummary]: ProjectPageNodeSummary[Key]
}
export type NavigationNodeDraftNode = {
  [Key in keyof ProjectNavigationNodeDraftNode]: ProjectNavigationNodeDraftNode[Key]
}
export type RunPageDesignAiOptions = {
  [Key in keyof PageDesignAiRunOptions]: PageDesignAiRunOptions[Key]
}
export type EditableProjectOption = ProjectSummary & {
  tenantId: string
}

function createLiveTargetProxy<T extends object>(readTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = readTarget()
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      const boundValue: unknown = value.bind(target)
      return boundValue
    },
    set(_target, property, value) {
      return Reflect.set(readTarget(), property, value)
    },
    has(_target, property) {
      return property in readTarget()
    },
    ownKeys() {
      return Reflect.ownKeys(readTarget())
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(readTarget(), property)
      if (!descriptor) return undefined
      return { ...descriptor, configurable: true }
    },
  })
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
  const initialUser = getUser()
  const initialScope: ProjectWorkspaceScope = {
    tenantId: initialUser?.tenantId ?? 'platform',
    projectId: initialUser?.defaultProjectId ?? 'homepage',
  }
  const activeEditScope = ref<ProjectWorkspaceScope>(initialScope)
  const currentEditor = shallowRef<ProjectWorkspace>(getAppProjectWorkspace(initialScope))
  const editor = createLiveTargetProxy<ProjectWorkspace>(() => currentEditor.value)
  const project = createLiveTargetProxy<ProjectModel>(() => currentEditor.value.project)
  const tenantId = computed(() => activeEditScope.value.tenantId)
  const projectId = computed(() => activeEditScope.value.projectId)
  const projectPicker = reactive({
    tenantId: initialScope.tenantId,
    projectId: initialScope.projectId,
  })
  const editableProjects = ref<EditableProjectOption[]>([])
  const projectOptionsLoading = ref(false)
  const pageFileNames = PAGE_NODE_FILE_NAMES
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

  // ── 导航树（ProjectModel 投影，非独立真源）──
  const navLoading = ref(false)
  const navSaving = ref(false)
  const navEditDtoRevision = ref(0)
  const projectRevision = ref(project.revision)
  const loadedNavigationScopeKeys = new Set<string>()

  function currentScopeKey(): string {
    return `${activeEditScope.value.tenantId}:${activeEditScope.value.projectId}`
  }

  function isDefaultUserProjectScope(): boolean {
    const user = getUser()
    const runtimeScope = user === null
      ? initialScope
      : { tenantId: user.tenantId, projectId: user.defaultProjectId }
    return activeEditScope.value.tenantId === runtimeScope.tenantId
      && activeEditScope.value.projectId === runtimeScope.projectId
  }

  function readNavigationProjection() {
    void projectRevision.value
    return project.readNavigationProjection()
  }

  const navigationProjection = computed(() => readNavigationProjection())
  const activePageProjection = computed(() => {
    void projectRevision.value
    return project.readActivePageProjection()
  })
  const dirtyProjection = computed(() => {
    void projectRevision.value
    return project.readDirtyProjection()
  })
  const treeData = computed(() => navigationProjection.value.treeData)
  const pageList = computed(() => navigationProjection.value.pageFeatures)
  const selectedNode = computed(() => navigationProjection.value.selectedNode)
  const navEmpty = computed(() => navigationProjection.value.treeData.length === 0)
  const activePageId = computed(() => activePageProjection.value.pageId)

  function handleProjectModelEvent(): void {
    projectRevision.value = project.revision
    refreshNavEditDtoBindings()
  }

  let unsubscribeProjectModel = currentEditor.value.project.subscribe(handleProjectModelEvent)

  function bindProjectModelEvents(): void {
    unsubscribeProjectModel()
    unsubscribeProjectModel = currentEditor.value.project.subscribe(handleProjectModelEvent)
    projectRevision.value = currentEditor.value.project.revision
    refreshNavEditDtoBindings()
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      unsubscribeProjectModel()
      cancelAutoSave()
    })
  }

  function normalizeEditScope(scope: Partial<ProjectWorkspaceScope>): ProjectWorkspaceScope {
    const scopedTenantId = scope.tenantId?.trim()
    const pickerTenantId = projectPicker.tenantId.trim()
    const scopedProjectId = scope.projectId?.trim()
    const pickerProjectId = projectPicker.projectId.trim()
    const normalizedTenantId = scopedTenantId && scopedTenantId.length > 0
      ? scopedTenantId
      : (pickerTenantId.length > 0 ? pickerTenantId : tenantId.value)
    const normalizedProjectId = scopedProjectId && scopedProjectId.length > 0
      ? scopedProjectId
      : (pickerProjectId.length > 0 ? pickerProjectId : projectId.value)
    if (!normalizedTenantId) throw new Error('tenantId 不能为空')
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    return { tenantId: normalizedTenantId, projectId: normalizedProjectId }
  }

  function sameEditScope(scope: ProjectWorkspaceScope): boolean {
    return tenantId.value === scope.tenantId && projectId.value === scope.projectId
  }

  async function loadEditableProjects(targetTenantId = projectPicker.tenantId): Promise<void> {
    const normalizedTenantId = targetTenantId.trim()
    if (!normalizedTenantId) {
      addStatus('tenantId 不能为空，无法加载项目列表', 'warning')
      return
    }

    projectOptionsLoading.value = true
    try {
      const rows = await http.get<ProjectSummary[]>(getProjectApi(normalizedTenantId))
      editableProjects.value = rows
        .filter(row => row.projectId.trim() !== '')
        .map(row => ({
          ...row,
          tenantId: normalizedTenantId,
        }))
      if (!editableProjects.value.some(row => row.projectId === projectPicker.projectId)) {
        projectPicker.projectId = editableProjects.value[0]?.projectId ?? projectPicker.projectId
      }
    } catch (error) {
      editableProjects.value = []
      addStatus(`加载租户 ${normalizedTenantId} 项目列表失败: ${String(error)}`, 'error')
    } finally {
      projectOptionsLoading.value = false
    }
  }

  async function openEditingProject(
    scope: Partial<ProjectWorkspaceScope>,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    const nextScope = normalizeEditScope(scope)
    if (sameEditScope(nextScope)) return true

    if (project.readDirtyProjection().hasAnyDirty && options.force !== true) {
      addStatus('当前项目模型还有未保存改动，请先保存后再切换编辑项目', 'warning')
      projectPicker.tenantId = tenantId.value
      projectPicker.projectId = projectId.value
      return false
    }

    cancelAutoSave()
    activeEditScope.value = nextScope
    projectPicker.tenantId = nextScope.tenantId
    projectPicker.projectId = nextScope.projectId
    currentEditor.value = getAppProjectWorkspace(nextScope)
    bindProjectModelEvents()
    linkProbeInfo.value = null
    autoSaveStatus.value = 'idle'
    await loadNavConfig({ preserveActivePageId: readPersistedActivePageId() })
    return true
  }

  async function openProjectPickerScope(options?: { force?: boolean }): Promise<boolean> {
    return openEditingProject({
      tenantId: projectPicker.tenantId,
      projectId: projectPicker.projectId,
    }, options)
  }

  async function syncRuntimeNavigationIfDefaultProject(): Promise<void> {
    if (isDefaultUserProjectScope()) {
      await reloadAndSyncNavigation()
    }
  }

  function refreshNavEditDtoBindings(): void {
    navEditDtoRevision.value++
  }

  function readNavEditDto(): NavigationNodeDraft | null {
    void navEditDtoRevision.value
    return project.navigationDraft
  }

  // ── 节点编辑表单（navEditDto：代理到 project.navigationDraft 工作副本）──
  const navEditDto = reactive({
    get id(): string { return readNavEditDto()?.node.id ?? '' },
    set id(_v: string) {},
    get title(): string { return readNavEditDto()?.node.title ?? '' },
    set title(v: string) { const dto = project.navigationDraft; if (dto) { dto.node.title = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get icon(): string { return readNavEditDto()?.node.icon ?? '' },
    set icon(v: string) { const dto = project.navigationDraft; if (dto) { dto.node.icon = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get nodeKind(): NavNodeKind { return readNavEditDto()?.node.nodeKind ?? 'page' },
    set nodeKind(v: NavNodeKind) { const dto = project.navigationDraft; if (dto) { dto.node.nodeKind = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get dividerAfter(): boolean { return readNavEditDto()?.node.dividerAfter ?? false },
    set dividerAfter(v: boolean) { const dto = project.navigationDraft; if (dto) { dto.node.dividerAfter = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get description(): string { return readNavEditDto()?.node.description ?? '' },
    set description(v: string) { const dto = project.navigationDraft; if (dto) { dto.node.description = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get path(): string { return readNavEditDto()?.node.path ?? '' },
    set path(v: string) { const dto = project.navigationDraft; if (dto) { dto.node.path = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get linkTarget(): NavigationNodeDraftNode['linkTarget'] { return readNavEditDto()?.node.linkTarget ?? 'iframe' },
    set linkTarget(v: NavigationNodeDraftNode['linkTarget']) { const dto = project.navigationDraft; if (dto) { dto.node.linkTarget = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get childPlacement(): string { return readNavEditDto()?.node.childPlacement ?? '' },
    set childPlacement(v: string) { const dto = project.navigationDraft; if (dto) { dto.node.childPlacement = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get order(): number { return readNavEditDto()?.node.order ?? 0 },
    set order(v: number) { const dto = project.navigationDraft; if (dto) { dto.node.order = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get hidden(): boolean { return readNavEditDto()?.node.hidden ?? false },
    set hidden(v: boolean) { const dto = project.navigationDraft; if (dto) { dto.node.hidden = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get disabled(): boolean { return readNavEditDto()?.node.disabled ?? false },
    set disabled(v: boolean) { const dto = project.navigationDraft; if (dto) { dto.node.disabled = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get refId(): string { return readNavEditDto()?.node.refId ?? '' },
    set refId(v: string) { const dto = project.navigationDraft; if (dto) { dto.node.refId = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get permissionMode(): 'none' | 'masked' | 'invisible' { return readNavEditDto()?.node.permissionMode ?? 'masked' },
    set permissionMode(v: 'none' | 'masked' | 'invisible') { const dto = project.navigationDraft; if (dto) { dto.node.permissionMode = v; project.applyNavigationNodeEdit(dto); markNavDirty() } },
    get planningStatus(): 'planning_draft' | 'planning_confirmed' | undefined {
      return readNavEditDto()?.node.planningStatus
    },
    set planningStatus(v: 'planning_draft' | 'planning_confirmed' | undefined) {
      const dto = project.navigationDraft
      if (!dto) return
      dto.node.planningStatus = v
      project.applyNavigationNodeEdit(dto)
      markNavDirty()
    },
    get implGate(): 'closed' | 'open' | undefined {
      return readNavEditDto()?.node.implGate
    },
    set implGate(v: 'closed' | 'open' | undefined) {
      const dto = project.navigationDraft
      if (!dto) return
      dto.node.implGate = v
      project.applyNavigationNodeEdit(dto)
      markNavDirty()
    },
    get upstreamContractsSatisfied(): boolean {
      return readNavEditDto()?.node.upstreamContractsSatisfied ?? true
    },
    set upstreamContractsSatisfied(v: boolean) {
      const dto = project.navigationDraft
      if (!dto) return
      if (v) {
        delete dto.node.upstreamContractsSatisfied
      } else {
        dto.node.upstreamContractsSatisfied = false
      }
      project.applyNavigationNodeEdit(dto)
      markNavDirty()
    },
    get hasContext(): boolean { return readNavEditDto()?.context.hasContext ?? false },
    set hasContext(v: boolean) {
      const dto = project.navigationDraft
      if (dto) {
        dto.context.hasContext = v
        if (!v) { dto.context.items = [] }
        project.applyNavigationNodeEdit(dto)
        markNavDirty()
      }
    },
  })
  /** 模块上下文表单 — 代理到 project.navigationDraft.context（与 navEditDto 同模式）。 */
  const contextEdit = reactive({
    get items(): Array<{ id: string; title: string }> {
      void navEditDtoRevision.value
      return project.navigationDraft?.context.items ?? []
    },
    get placeholder(): string { return readNavEditDto()?.context.config.placeholder ?? '' },
    set placeholder(v: string) {
      const dto = project.navigationDraft
      if (!dto) return
      dto.context.config.placeholder = v
      project.applyNavigationNodeEdit(dto)
      markNavDirty()
    },
    get defaultValue(): string { return readNavEditDto()?.context.config.defaultValue ?? '' },
    set defaultValue(v: string) {
      const dto = project.navigationDraft
      if (!dto) return
      dto.context.config.defaultValue = v
      project.applyNavigationNodeEdit(dto)
      markNavDirty()
    },
    get paramName(): string { return readNavEditDto()?.context.config.paramName ?? '' },
    set paramName(v: string) {
      const dto = project.navigationDraft
      if (!dto) return
      dto.context.config.paramName = v
      project.applyNavigationNodeEdit(dto)
      markNavDirty()
    },
  })

  // ── 页面文件状态（经 ProjectWorkspace 加载/保存）──
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
    const dirty = dirtyProjection.value.dirtyFiles
    return pageFileNames.some((n) => dirty.has(n))
  })

  const navDirty = computed(() => {
    return dirtyProjection.value.navigationDirty
  })

  const hasAnyDirty = computed(() => {
    return dirtyProjection.value.hasAnyDirty
  })

  const pageDataDirty = computed(() => {
    return dirtyProjection.value.dirtyFiles.has('pagedata.json')
  })
  const pageDataError = computed(() => {
    return activePageProjection.value.parseErrors['pagedata.json']
  })

  // ═══════════════════════════════════════════════════════════
  // 工具：地址 / 持久化 pageId
  // ═══════════════════════════════════════════════════════════

  function buildActivePageStorageKey(): string {
    return `dev-system:active-page:${tenantId.value}:${projectId.value}`
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
    project.setActivePage(normalizedPageId, { forceReset: shouldReset })
    persistActivePageId(normalizedPageId)
    return true
  }

  function clearActivePageContext(): void {
    project.clearActivePage()
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
    project.applyNodeKindPreset(kind)
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
    const scopeKey = currentScopeKey()
    if (loadedNavigationScopeKeys.has(scopeKey)) return
    if (project.readNavigationProjection().treeData.length > 0) {
      loadedNavigationScopeKeys.add(scopeKey)
      return
    }

    const navFromRouter = isDefaultUserProjectScope() ? getNavTree() : null
    if (navFromRouter && navFromRouter.children.length > 0) {
      syncCommittedNavigationFromRouter()
      loadedNavigationScopeKeys.add(scopeKey)
      return
    }

    await editor.loadNavigation()
    loadedNavigationScopeKeys.add(scopeKey)
  }

  async function loadNavConfig(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }): Promise<void> {
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.id ?? null
    const preservedActivePageId = options?.preserveActivePageId?.trim() ?? ''
    navLoading.value = true
    try {
      await ensureCurrentProjectNavigationLoaded()
      refreshNavEditDtoBindings()
      addStatus(`项目 ${tenantId.value}/${projectId.value} 导航已就绪`, 'success')
    } catch (error) {
      addStatus(`导航加载失败: ${String(error)}`, 'error')
    } finally {
      navLoading.value = false
    }

    const snapTree = readNavigationProjection().treeData

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
        project.selectNode(null)
        linkProbeInfo.value = null
        return
      }
    }

    if (snapTree.length === 0) {
      project.selectNode(null)
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
    project.setActivePage(pageId)
    project.selectNode(node.id)
    project.beginNavigationDraft()
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

    const dto = project.navigationDraft
    if (dto) {
      const result = project.applyNavigationNodeEdit(dto)
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
    if (!project.readDirtyProjection().navigationDirty) { autoSaveStatus.value = 'idle'; return }
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
      project.selectNode(node.id)
      await editor.saveSelectedNavigationNode({ skipReload: true })
      await syncRuntimeNavigationIfDefaultProject()
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
      addStatus(`页面 ${pageId} 为宿主页面，不提供后端配置文件编辑`, 'warning')
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
    project.setActivePage(pageId)
    for (const name of pageFileNames) {
      if (!project.readDirtyProjection().dirtyFiles.has(name)) continue
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
    project.selectNode(node.id)
    try {
      const pageId = resolvePageNodePageId(node)
      if (pageId && isConfigNodeKind(node.nodeKind ?? 'page')) {
        await editor.selectPage(pageId)
        persistActivePageId(pageId)
      } else {
        clearActivePageContext()
        // Keep a navigation edit context for non-page nodes; this is not a pageModel.
        const navPageId = pageId || node.id || `nav-node-${node.id}`
        project.setActivePage(navPageId)
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
    const node: ProjectNodeData = {
      id: crypto.randomUUID(),
      nodeKind: 'module',
      title: '新模块',
      icon: 'FolderOpened',
      childPlacement: 'sidebar',
      children: [],
    }
    void editor.addNavigationNode({ node }).then(
      async () => {
        await syncRuntimeNavigationIfDefaultProject()
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
    try {
      await editor.addNavigationNode({ node, index: 0 })
      await syncRuntimeNavigationIfDefaultProject()
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
      await syncRuntimeNavigationIfDefaultProject()
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
          project.selectNode(null)
          clearActivePageContext()
        }
      if (shouldRemoveMountedPage) {
          bumpPageCache(pageId, '__deleted')
        }
        void syncRuntimeNavigationIfDefaultProject()
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
      await syncRuntimeNavigationIfDefaultProject()
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
    const dto = project.navigationDraft
    if (val && dto?.context.items.length === 0) {
      dto.context.items.push({ id: '', title: '' })
      project.applyNavigationNodeEdit(dto)
    }
    navEditDto.hasContext = val
  }
  function addContextItem(): void {
    const dto = project.navigationDraft
    if (!dto) return
    dto.context.items.push({ id: '', title: '' })
    project.applyNavigationNodeEdit(dto)
    markNavDirty()
  }
  function removeContextItem(idx: number): void {
    const dto = project.navigationDraft
    if (!dto) return
    dto.context.items.splice(idx, 1)
    project.applyNavigationNodeEdit(dto)
    markNavDirty()
  }
  function fillDemoContext(): void {
    navEditDto.hasContext = true
    const dto = project.navigationDraft
    if (!dto) return
    dto.context.items = DEMO_CONTEXT_ITEMS.map(item => ({ ...item }))
    Object.assign(dto.context.config, DEMO_CONTEXT_CONFIG)
    project.applyNavigationNodeEdit(dto)
    markNavDirty()
    addStatus('已填充模块上下文演示数据', 'info')
  }

  /** 选项 id/title 就地编辑后提交到 DTO。 */
  function commitContextEdit(): void {
    const dto = project.navigationDraft
    if (!dto) return
    project.applyNavigationNodeEdit(dto)
    markNavDirty()
  }

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize(): Promise<void> {
    await loadEditableProjects(projectPicker.tenantId)
    const persistedActivePageId = readPersistedActivePageId()
    await loadNavConfig({ preserveActivePageId: persistedActivePageId })
  }

  return {
    // 导航树
    get tenantId(): string { return tenantId.value },
    get projectId(): string { return projectId.value },
    projectPicker,
    editableProjects,
    projectOptionsLoading,
    treeData,
    navLoading,
    navSaving,
    navDirty,
    selectedNode,

    // 编辑表单（navEditDto 代理到 project.navigationDraft 工作副本）
    navEditDto,
    contextEdit,

    // 空导航状态
    navEmpty,

    // 页面 4 文件
    pageFileNames,
    activePageId,
    pageIoBusy,
    projectRevision,
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
    project,

    // 方法
    addStatus,
    loadEditableProjects,
    openEditingProject,
    openProjectPickerScope,
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
