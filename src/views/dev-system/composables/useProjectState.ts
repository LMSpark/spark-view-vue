/**
 * 项目状态管理 — 工程链核心 composable
 *
 * 管理整个工程链的状态，包括：
 * - 需求列表
 * - 功能模块
 * - 导航树（后端权威，内存副本）
 * - 页面设计状态
 * - localStorage 自动持久化（debounce 1s）
 * - 多 Tab 冲突检测
 */
import { reactive, watch, toRaw } from 'vue'
import type { NavRoot } from '@spark-view/spark-app'
import type { ChatMessage } from '@/composables/useAiChat'
import type { DesignProposal, ProposalStatus } from '@/composables/useDesignSession'
import type {
  ProjectState,
  ProjectStage,
  WorkFocus,
  Requirement,
  FunctionModule,
  PagePlan,
  PageDesignState,
  PersistedProject,
  SerializedChatMessage,
  SerializedProposal,
  SerializedPageDesignState,
} from './types'
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  FOCUS_TO_STAGE,
} from './types'
import { buildAiWorkContext } from './useAiWorkContext'
import { canAdvance, canRegress, nextStage, prevStage } from './useStageFlow'

// ── Serialization helpers ─────────────────────────────────────

function serializeMessage(msg: ChatMessage): SerializedChatMessage {
  const result: SerializedChatMessage = {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : msg.timestamp.toISOString(),
  }
  if (msg.reasoning !== undefined) result.reasoning = msg.reasoning
  if (msg.streaming !== undefined) result.streaming = msg.streaming
  return result
}

function deserializeMessage(msg: SerializedChatMessage): ChatMessage {
  const result: ChatMessage = {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
  }
  if (msg.reasoning !== undefined) result.reasoning = msg.reasoning
  return result
}

function serializeProposal(p: DesignProposal): SerializedProposal {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    content: p.content,
    status: p.status,
    messageId: p.messageId,
    stage: p.stage,
    timestamp: typeof p.timestamp === 'string' ? p.timestamp : p.timestamp.toISOString(),
  }
}

function deserializeProposal(p: SerializedProposal): DesignProposal {
  return {
    id: p.id,
    type: p.type as DesignProposal['type'],
    title: p.title,
    content: p.content,
    status: p.status as ProposalStatus,
    messageId: p.messageId,
    stage: p.stage,
    timestamp: new Date(p.timestamp),
  }
}

function serializePageStates(
  states: Map<string, PageDesignState>,
): Record<string, SerializedPageDesignState> {
  const result: Record<string, SerializedPageDesignState> = {}
  for (const [key, state] of states) {
    result[key] = {
      pageId: state.pageId,
      proposals: state.proposals.map(serializeProposal),
      phase: state.phase,
      chatHistory: state.chatHistory.map(serializeMessage),
    }
  }
  return result
}

function deserializePageStates(
  raw: Record<string, SerializedPageDesignState>,
): Map<string, PageDesignState> {
  const map = new Map<string, PageDesignState>()
  for (const [key, s] of Object.entries(raw)) {
    map.set(key, {
      pageId: s.pageId,
      proposals: s.proposals.map(deserializeProposal),
      phase: s.phase,
      chatHistory: s.chatHistory.map(deserializeMessage),
    })
  }
  return map
}

function serializeGlobalHistory(
  history: Record<string, ChatMessage[]>,
): Record<string, SerializedChatMessage[]> {
  const result: Record<string, SerializedChatMessage[]> = {}
  for (const [key, msgs] of Object.entries(history)) {
    result[key] = msgs.map(serializeMessage)
  }
  return result
}

function deserializeGlobalHistory(
  raw: Record<string, SerializedChatMessage[]>,
): Record<string, ChatMessage[]> {
  const result: Record<string, ChatMessage[]> = {}
  for (const [key, msgs] of Object.entries(raw)) {
    result[key] = msgs.map(deserializeMessage)
  }
  return result
}

// ── Version migration ─────────────────────────────────────────

const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // version 0 → 1: 初始版本，无特殊迁移
  // 可在此处扩展：
  // 2: (data) => { /* add new fields, transform structures */ return data }
}

function migrateStorage(data: { version: number }): PersistedProject | null {
  let current = data as Record<string, unknown>
  for (let v = data.version; v < STORAGE_VERSION; v++) {
    const migrator = MIGRATIONS[v + 1]
    if (!migrator) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    current = migrator(current) as Record<string, unknown>
  }
  return current as unknown as PersistedProject
}

// ── Load from storage ─────────────────────────────────────────

function loadFromStorage(): Partial<ProjectState> | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const data = JSON.parse(raw) as PersistedProject

    if (data.version < STORAGE_VERSION) {
      const migrated = migrateStorage(data)
      if (!migrated) return null
      return deserializePersistedProject(migrated)
    }

    return deserializePersistedProject(data)
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function deserializePersistedProject(data: PersistedProject): Partial<ProjectState> {
  return {
    currentStage: data.currentStage,
    workFocus: data.workFocus ?? { view: 'overview' },
    requirements: data.requirements,
    activeRequirementId: data.activeRequirementId,
    modules: data.modules,
    activePageId: data.activePageId,
    pageDesignStates: deserializePageStates(data.pageDesignStates),
    globalChatHistory: deserializeGlobalHistory(data.globalChatHistory),
    lastUpdated: data.lastUpdated,
  }
}

// ── Default state factory ─────────────────────────────────────

function createDefaultState(): ProjectState {
  return {
    currentStage: 'requirements',
    workFocus: { view: 'overview' },
    requirements: [],
    activeRequirementId: null,
    modules: [],
    navRoot: { childPlacement: 'header', children: [] },
    navDirty: false,
    activePageId: null,
    pageDesignStates: new Map(),
    aiPanelVisible: true,
    aiContext: {
      stage: 'requirements',
      targetId: null,
      systemPrompt: '',
      contextData: '',
    },
    globalChatHistory: {},
    lastUpdated: new Date().toISOString(),
  }
}

// ── Composable ────────────────────────────────────────────────

export function useProjectState() {
  // 从 localStorage 恢复，或创建全新状态
  const persisted = loadFromStorage()
  const defaults = createDefaultState()
  const state = reactive<ProjectState>({
    ...defaults,
    ...persisted,
    // navRoot 始终从后端加载，不从 localStorage 恢复
    navRoot: defaults.navRoot,
    navDirty: false,
    aiPanelVisible: true,
    aiContext: defaults.aiContext,
    // Map 需要特殊处理
    pageDesignStates: persisted?.pageDesignStates ?? defaults.pageDesignStates,
    globalChatHistory: persisted?.globalChatHistory ?? defaults.globalChatHistory,
  })

  // 更新 AI 上下文
  state.aiContext = buildAiWorkContext(state)

  // ── 持久化（debounce 1s）──────────────────────────────────

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function saveToStorage() {
    const data: PersistedProject = {
      version: STORAGE_VERSION,
      requirements: toRaw(state.requirements),
      modules: toRaw(state.modules),
      currentStage: state.currentStage,
      workFocus: toRaw(state.workFocus),
      activeRequirementId: state.activeRequirementId,
      activePageId: state.activePageId,
      pageDesignStates: serializePageStates(state.pageDesignStates),
      globalChatHistory: serializeGlobalHistory(state.globalChatHistory),
      lastUpdated: new Date().toISOString(),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // QuotaExceededError — 先清理最旧的对话历史
      trimOldestChatHistory(state)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        // 仍然超限 — 静默失败（UI 层可选:弹警告建议导出）
        if (import.meta.env.DEV) {
          console.warn('[useProjectState] localStorage quota exceeded')
        }
      }
    }
  }

  function debouncedSave() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      saveToStorage()
      saveTimer = null
    }, 1000)
  }

  watch(
    () => [
      state.currentStage,
      state.workFocus,
      state.requirements,
      state.modules,
      state.activeRequirementId,
      state.activePageId,
      state.pageDesignStates,
      state.globalChatHistory,
    ],
    debouncedSave,
    { deep: true },
  )

  // ── 多 Tab 冲突检测 ───────────────────────────────────────

  function handleStorageEvent(e: StorageEvent) {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const remote = JSON.parse(e.newValue) as PersistedProject
      if (remote.lastUpdated > state.lastUpdated) {
        // 其他 Tab 有更新 — 由 UI 层决定是否加载
        // 这里只标记，不自动覆盖
        state.lastUpdated = remote.lastUpdated
      }
    } catch {
      // ignore malformed
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent)
  }

  // ── 需求管理 ──────────────────────────────────────────────

  function addRequirement(title: string, description: string): Requirement {
    const req: Requirement = {
      id: crypto.randomUUID(),
      title,
      description,
      status: 'draft',
      relatedModules: [],
      createdAt: new Date().toISOString(),
    }
    state.requirements.push(req)
    return req
  }

  function updateRequirement(id: string, patch: Partial<Requirement>) {
    const req = state.requirements.find(r => r.id === id)
    if (req) {
      Object.assign(req, patch)
    }
  }

  function removeRequirement(id: string) {
    const idx = state.requirements.findIndex(r => r.id === id)
    if (idx >= 0) {
      state.requirements.splice(idx, 1)
    }
  }

  // ── 功能模块管理 ──────────────────────────────────────────

  function setModules(modules: FunctionModule[]) {
    state.modules = modules
  }

  function addModule(mod: FunctionModule) {
    state.modules.push(mod)
  }

  function updateModule(id: string, patch: Partial<FunctionModule>) {
    const mod = state.modules.find(m => m.id === id)
    if (mod) {
      Object.assign(mod, patch)
    }
  }

  function removeModule(id: string) {
    const idx = state.modules.findIndex(m => m.id === id)
    if (idx >= 0) {
      state.modules.splice(idx, 1)
    }
  }

  function addPageToModule(moduleId: string, page: PagePlan) {
    const mod = state.modules.find(m => m.id === moduleId)
    if (mod) {
      mod.pages.push(page)
    }
  }

  function removePageFromModule(moduleId: string, pageId: string) {
    const mod = state.modules.find(m => m.id === moduleId)
    if (mod) {
      const idx = mod.pages.findIndex(p => p.pageId === pageId)
      if (idx >= 0) {
        mod.pages.splice(idx, 1)
        state.pageDesignStates.delete(pageId)
      }
    }
  }

  function updatePageInModule(moduleId: string, pageId: string, patch: Partial<PagePlan>) {
    const mod = state.modules.find(m => m.id === moduleId)
    if (mod) {
      const page = mod.pages.find(p => p.pageId === pageId)
      if (page) {
        Object.assign(page, patch)
      }
    }
  }

  // ── 导航管理（后端权威 → 内存副本）────────────────────────

  const NAV_API = '/api/navigation'

  async function loadNavFromBackend() {
    try {
      const resp = await fetch(NAV_API)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const config = await resp.json() as NavRoot
      state.navRoot = config
      state.navDirty = false
    } catch {
      // 后端不可用时保持空导航
      state.navRoot = { childPlacement: 'header', children: [] }
      state.navDirty = false
    }
  }

  function setNavRoot(navRoot: NavRoot) {
    state.navRoot = navRoot
    state.navDirty = true
  }

  async function saveNavToBackend(): Promise<boolean> {
    try {
      const resp = await fetch(NAV_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.navRoot),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      state.navDirty = false
      return true
    } catch {
      return false
    }
  }

  // ── 页面设计状态 ──────────────────────────────────────────

  function getOrCreatePageDesignState(pageId: string): PageDesignState {
    let ps = state.pageDesignStates.get(pageId)
    if (!ps) {
      ps = {
        pageId,
        proposals: [],
        phase: 'discussing',
        chatHistory: [],
      }
      state.pageDesignStates.set(pageId, ps)
    }
    return ps
  }

  // ── 工作焦点 & 阶段切换 ────────────────────────────────────

  function setFocus(focus: WorkFocus) {
    state.workFocus = focus
    state.currentStage = FOCUS_TO_STAGE[focus.view]
    // 同步 active IDs
    if (focus.view === 'requirement') {
      state.activeRequirementId = focus.requirementId
    } else if (focus.view === 'page-design') {
      state.activePageId = focus.pageId
    }
    state.aiContext = buildAiWorkContext(state)
  }

  function goToStage(stage: ProjectStage) {
    state.currentStage = stage
    state.aiContext = buildAiWorkContext(state)
  }

  function tryAdvance(): { success: boolean; reason?: string } {
    const result = canAdvance(state.currentStage, state)
    if (!result.allowed) {
      return { success: false, reason: result.reason }
    }
    const next = nextStage(state.currentStage)
    if (next) {
      goToStage(next)
      return { success: true }
    }
    return { success: false, reason: '已到最后阶段' }
  }

  function tryRegress(): { success: boolean; reason?: string; needsConfirm?: boolean } {
    const prev = prevStage(state.currentStage)
    if (!prev) {
      return { success: false, reason: '已到第一阶段' }
    }
    const result = canRegress(prev, state)
    if (!result.allowed) {
      return { success: false, reason: result.reason, needsConfirm: true }
    }
    goToStage(prev)
    return { success: true }
  }

  function forceRegress(stage: ProjectStage) {
    goToStage(stage)
  }

  // ── 对话历史 ──────────────────────────────────────────────

  function getStageHistory(stage: ProjectStage): ChatMessage[] {
    return state.globalChatHistory[stage] ?? []
  }

  function setStageHistory(stage: ProjectStage, messages: ChatMessage[]) {
    state.globalChatHistory[stage] = messages
  }

  // ── 导出 / 导入 ──────────────────────────────────────────

  function exportProject(): string | null {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw
  }

  function importProject(json: string): boolean {
    try {
      const data = JSON.parse(json) as PersistedProject
      if (data.version > STORAGE_VERSION) {
        return false
      }
      const restored = deserializePersistedProject(data)
      Object.assign(state, restored)
      state.aiContext = buildAiWorkContext(state)
      saveToStorage()
      return true
    } catch {
      return false
    }
  }

  // ── 清理 ──────────────────────────────────────────────────

  function resetProject() {
    const fresh = createDefaultState()
    Object.assign(state, fresh)
    localStorage.removeItem(STORAGE_KEY)
  }

  function dispose() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent)
    }
  }

  return {
    state,
    // 需求
    addRequirement,
    updateRequirement,
    removeRequirement,
    // 功能模块
    setModules,
    addModule,
    updateModule,
    removeModule,
    addPageToModule,
    removePageFromModule,
    updatePageInModule,
    // 导航
    loadNavFromBackend,
    setNavRoot,
    saveNavToBackend,
    // 页面设计
    getOrCreatePageDesignState,
    // 阶段流转
    goToStage,
    setFocus,
    tryAdvance,
    tryRegress,
    forceRegress,
    // 对话历史
    getStageHistory,
    setStageHistory,
    // 导出/导入
    exportProject,
    importProject,
    // 生命周期
    resetProject,
    dispose,
  }
}

export type ProjectStateReturn = ReturnType<typeof useProjectState>
export type ProjectAPI = ProjectStateReturn

// ── 辅助：清理最旧对话历史（localStorage 容量超限时） ───────────

function trimOldestChatHistory(state: ProjectState) {
  // 最多保留最近 20 条每阶段
  const MAX_PER_STAGE = 20
  for (const key of Object.keys(state.globalChatHistory)) {
    const msgs = state.globalChatHistory[key]
    if (msgs && msgs.length > MAX_PER_STAGE) {
      state.globalChatHistory[key] = msgs.slice(-MAX_PER_STAGE)
    }
  }
  // 页面设计对话也截断
  for (const [, ps] of state.pageDesignStates) {
    if (ps.chatHistory.length > MAX_PER_STAGE) {
      ps.chatHistory = ps.chatHistory.slice(-MAX_PER_STAGE)
    }
  }
}
