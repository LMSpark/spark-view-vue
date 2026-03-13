/**
 * 开发工作台 — 工程链核心类型定义
 *
 * 所有跨 composable 共享的类型集中在此文件，
 * 避免循环依赖。
 */
import type { NavRoot } from '@spark-view/spark-app'
import type { DesignProposal, SessionPhase } from '@/composables/useDesignSession'
import type { ChatMessage } from '@/composables/useAiChat'

// ── 阶段模型 ──────────────────────────────────────────────────

/** 工程链五阶段 */
export type ProjectStage =
  | 'requirements'
  | 'functions'
  | 'navigation'
  | 'page-design'
  | 'verification'

/** 阶段有序列表（用于索引计算） */
export const STAGE_ORDER: readonly ProjectStage[] = [
  'requirements',
  'functions',
  'navigation',
  'page-design',
  'verification',
] as const

/** 阶段元信息 */
export const STAGE_META: Record<ProjectStage, { label: string; icon: string }> = {
  'requirements':  { label: '需求理解', icon: '📋' },
  'functions':     { label: '功能拆解', icon: '🏗️' },
  'navigation':    { label: '导航设计', icon: '🌐' },
  'page-design':   { label: '页面设计', icon: '📄' },
  'verification':  { label: '验证部署', icon: '✅' },
}

// ── 工作焦点（决定工作区显示内容）─────────────────────────────

/** 工作焦点 — 由树节点点击或手动切换驱动，决定中栏内容 */
export type WorkFocus =
  | { view: 'overview' }
  | { view: 'requirement'; requirementId: string }
  | { view: 'functions' }
  | { view: 'module'; moduleId: string }
  | { view: 'navigation' }
  | { view: 'page-design'; pageId: string }
  | { view: 'verification' }

/** 焦点视图 → 对应的阶段映射（用于 AI 上下文） */
export const FOCUS_TO_STAGE: Record<WorkFocus['view'], ProjectStage> = {
  'overview':     'requirements',
  'requirement':  'requirements',
  'functions':    'functions',
  'module':       'functions',
  'navigation':   'navigation',
  'page-design':  'page-design',
  'verification': 'verification',
}

// ── 需求 ──────────────────────────────────────────────────────

export type RequirementStatus = 'draft' | 'analyzed' | 'planned' | 'completed'

/** 用户需求条目 */
export interface Requirement {
  id: string
  title: string
  description: string
  status: RequirementStatus
  aiSummary?: string
  relatedModules: string[]
  createdAt: string   // ISO timestamp（方便序列化）
}

// ── 功能模块 ──────────────────────────────────────────────────

export type ModuleStatus = 'planned' | 'designing' | 'generated' | 'verified'

/** 功能模块（AI 规划产出） */
export interface FunctionModule {
  id: string
  name: string
  icon: string
  description: string
  pages: PagePlan[]
  requirementId: string
  status: ModuleStatus
}

/** 页面规划（功能拆解阶段产出） */
export interface PagePlan {
  pageId: string
  title: string
  description: string
  pageType: 'list' | 'detail' | 'form' | 'dashboard' | 'tree' | 'custom'
  dataEntities: string[]
  status: 'planned' | 'designing' | 'generated' | 'verified'
}

// ── 页面设计状态 ──────────────────────────────────────────────

/** 单页设计状态（复用 DesignSession 概念） */
export interface PageDesignState {
  pageId: string
  proposals: DesignProposal[]
  phase: SessionPhase
  chatHistory: ChatMessage[]
}

// ── AI 工作上下文 ─────────────────────────────────────────────

/** AI 面板快捷操作 */
export interface QuickAction {
  label: string
  action: string
  promptTemplate: string
}

/** AI 面板模式配置 */
export interface AiPanelMode {
  systemPrompt: string
  quickActions: QuickAction[]
  proposalEnabled: boolean
  autoQueryEnabled: boolean
}

/** AI 工作上下文（告诉 AI 面板当前做什么） */
export interface AiWorkContext {
  stage: ProjectStage
  targetId: string | null
  systemPrompt: string
  contextData: string
}

// ── 项目状态 ──────────────────────────────────────────────────

/** 工程链项目总状态 */
export interface ProjectState {
  currentStage: ProjectStage
  /** 工作焦点（决定中栏显示内容） */
  workFocus: WorkFocus
  requirements: Requirement[]
  activeRequirementId: string | null
  modules: FunctionModule[]
  navRoot: NavRoot
  navDirty: boolean
  activePageId: string | null
  pageDesignStates: Map<string, PageDesignState>
  aiPanelVisible: boolean
  aiContext: AiWorkContext
  /** 全局阶段对话历史（需求/功能/导航各自独立） */
  globalChatHistory: Record<string, ChatMessage[]>
  /** 上次更新时间（ISO） */
  lastUpdated: string
}

// ── 持久化 ────────────────────────────────────────────────────

export const STORAGE_KEY = 'spark-dev-project'
export const STORAGE_VERSION = 1

/** 序列化后的聊天消息（Date → string） */
export interface SerializedChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: string
  streaming?: boolean
}

/** 序列化后的 Proposal（Date → string） */
export interface SerializedProposal {
  id: string
  type: string
  title: string
  content: string
  status: string
  messageId: string
  stage: string
  timestamp: string
}

/** 序列化后的页面设计状态 */
export interface SerializedPageDesignState {
  pageId: string
  proposals: SerializedProposal[]
  phase: SessionPhase
  chatHistory: SerializedChatMessage[]
}

/** localStorage 持久化结构 */
export interface PersistedProject {
  version: number
  requirements: Requirement[]
  modules: FunctionModule[]
  currentStage: ProjectStage
  workFocus?: WorkFocus
  activeRequirementId: string | null
  activePageId: string | null
  pageDesignStates: Record<string, SerializedPageDesignState>
  globalChatHistory: Record<string, SerializedChatMessage[]>
  lastUpdated: string
}

// ── 阶段流转 ──────────────────────────────────────────────────

export type AdvanceResult =
  | { allowed: true; hint?: string }
  | { allowed: false; reason: string }
