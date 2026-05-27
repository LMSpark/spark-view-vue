/**
 * 导航模型类型定义 — SSOT。
 *
 * 描述应用导航树的节点类型、权限模式、上下文状态等。
 * 这些纯数据模型类型由 spark-page-config 委托到 spark-data，
 * 供 spark-component、spark-app 等下游包直接使用。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按导航树建模流程）                         │
 * │                                                      │
 * │  1. 枚举联合：ChildPlacement / NavNodeKind            │
 * │              LinkTarget / NavPermissionMode           │
 * │  2. 基础模块：AppModuleBase                           │
 * │  3. 导航配置：AppNavigation                           │
 * │  4. 节点定义：NavNode / AppNavRoot / isNavNode        │
 * │  5. 区域布局：RegionItems / RegionVisibility          │
 * │  6. 上下文：  NavContextItem / NavContextConfig       │
 * │              NavContextState                          │
 * └──────────────────────────────────────────────────────┘
 */

import { isRecord } from '@spark-view/spark-utils'

// ═══════════════════════════════════════════════════════
// 1. 枚举联合
// ═══════════════════════════════════════════════════════

/** 子节点布局位置：决定子节点在 UI 中的渲染区域 */
export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

/** 导航节点类型 */
export type NavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'system-action'
  | 'page'
  | 'link'
  | 'sub-page'
  | 'ref'

/** 外链打开方式 */
export type LinkTarget = 'iframe' | 'new-tab' | 'self'

/** 权限未匹配时的展示模式 */
export type NavPermissionMode = 'none' | 'masked' | 'invisible'

// ═══════════════════════════════════════════════════════
// 2. 基础模块
// ═══════════════════════════════════════════════════════

/** 模块基础信息：ID、标题、描述、版本号 */
export type AppModuleBase = {
  id?: string
  title: string
  description?: string
  version?: string
}

// ═══════════════════════════════════════════════════════
// 3. 导航配置
// ═══════════════════════════════════════════════════════

/** 导航行为配置：图标、排序、可见性、权限模式、子节点布局等 */
export type AppNavigation = {
  icon?: string
  nodeKind?: NavNodeKind
  childPlacement?: ChildPlacement
  context?: string | NavContextItem[] | NavContextConfig
  order?: number
  hidden?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  permissionMode?: NavPermissionMode
}

// ═══════════════════════════════════════════════════════
// 4. 节点定义
// ═══════════════════════════════════════════════════════

/** 导航树节点 */
export type NavNode = AppModuleBase & AppNavigation & {
  id: string
  children?: NavNode[]
  path?: string
  linkTarget?: LinkTarget
  redirect?: string
  parentPageId?: string
  refId?: string
  refPath?: string
  refProjectId?: string
  refBroken?: boolean
}

export function isNavNode(value: unknown): value is NavNode {
  if (!isRecord(value)) return false
  if (typeof value['id'] !== 'string') return false
  if (typeof value['title'] !== 'string') return false
  const children = value['children']
  return children === undefined || (Array.isArray(children) && children.every(isNavNode))
}

/** 导航树根节点 */
export type AppNavRoot = AppModuleBase & {
  childPlacement: 'header' | 'sidebar'
  children: NavNode[]
  homePath?: string
}

// ═══════════════════════════════════════════════════════
// 5. 区域布局
// ═══════════════════════════════════════════════════════

/** 按区域分组的导航节点列表 */
export type RegionItems = {
  header: NavNode[]
  sidebar: NavNode[]
  toolbar: NavNode[]
  userMenu: NavNode[]
}

/** 各区域是否可见 */
export type RegionVisibility = {
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}

// ═══════════════════════════════════════════════════════
// 6. 动态上下文
// ═══════════════════════════════════════════════════════

/** 上下文下拉选项项 */
export type NavContextItem = {
  id: string | number
  title: string
}

/** 动态上下文配置：描述上下文的来源和交互行为 */
export type NavContextConfig = {
  source: string | NavContextItem[]
  placeholder?: string
  defaultValue?: string | number
  paramName?: string
}

/** 导航上下文运行时状态 */
export type NavContextState = {
  config: NavContextConfig
  nodeId: string
  selected: string | number | null
  items: NavContextItem[]
  loading: boolean
  error: string | null
}
