/**
 * 开发工作台 — WBS 节点模型
 *
 * 每个节点统一携带：需求描述 / 导航属性 / 页面配置
 */

// ── WBS 节点 ───────────────────────────────────────────────────

export type WbsNodeType = 'group' | 'page'
export type WbsNodeStatus = 'planned' | 'designing' | 'generated' | 'verified'
export type PageType = 'list' | 'detail' | 'form' | 'dashboard' | 'tree' | 'custom'

/** WBS 节点 — 项目树统一模型 */
export interface WbsNode {
  id: string
  title: string
  /** 需求 / 功能描述 */
  description: string
  type: WbsNodeType
  icon: string
  status: WbsNodeStatus

  // ── 导航属性 ──
  navPath?: string
  navHidden?: boolean

  // ── 页面配置（type === 'page' 时有效）──
  pageId?: string
  pageType?: PageType

  children: WbsNode[]
}

// ── 项目状态 ───────────────────────────────────────────────────

export interface ProjectState {
  projectName: string
  wbsRoot: WbsNode[]
  selectedNodeId: string | null
  aiPanelVisible: boolean
  lastUpdated: string
}

// ── 持久化 ─────────────────────────────────────────────────────

export const STORAGE_KEY = 'spark-dev-project-v2'
export const STORAGE_VERSION = 1

export interface PersistedProject {
  version: number
  projectName: string
  wbsRoot: WbsNode[]
  selectedNodeId: string | null
  lastUpdated: string
}
