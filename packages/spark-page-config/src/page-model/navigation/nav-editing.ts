/**
 * 导航编辑器：节点草稿、补丁应用、树遍历和编辑会话。
 *
 * 为导航树编辑器提供从 NavNode 到草稿表单的双向转换，
 * 以及编辑会话的内存状态管理。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按编辑会话生命周期）                        │
 * │                                                      │
 * │  1. 草稿类型：NavigationNodeDraft                     │
 * │              NavigationContextDraft                   │
 * │              NavigationNodeDraftInput                 │
 * │              NavigationNodeDraftApplyResult           │
 * │  2. 树遍历：  NavNodeLocation                         │
 * │  3. 常量表：  DEFAULT_NAV_ICON_BY_KIND                │
 * │  4. 类型守卫：isNavContextConfig / isChildPlacement    │
 * │  5. 节点正规化：normalizePageIdFromPath               │
 * │                normalizeNavNode / normalizeNavRoot    │
 * │                buildNavRoot                           │
 * │  6. 树查找：  findNodeById / findParentNodeById       │
 * │              findNodeLocation / findConfigNodeByPageId│
 * │  7. 草稿操作：createNavigationNodeDraft               │
 * │              applyNodeKindPresetToDraft               │
 * │              createNavigationNodePatch                │
 * │              applyNavigationNodeDraftToNode           │
 * │  8. 工厂函数：createRootModuleNode                    │
 * │              createChildPageNode                      │
 * │              createReservedRootGroup                  │
 * │  9. 编辑会话：NavigationEditSession                   │
 * └──────────────────────────────────────────────────────┘
 */

import { deepClone } from '@spark-view/spark-utils'
import type {
  AppNavRoot,
  ChildPlacement,
  LinkTarget,
  NavContextConfig,
  NavContextItem,
  NavNode,
  NavNodeKind,
  NavPermissionMode,
} from './nav-model'

// ═══════════════════════════════════════════════════════
// 1. 草稿类型
//
// 描述导航节点在编辑器表单中的中间态表示，
// 从 NavNode 转换而来，可被用户修改后再打补丁回写。
// ═══════════════════════════════════════════════════════

/** 导航节点草稿：编辑器表单中每个字段的中间态 */
export type NavigationNodeDraft = {
  /** 节点 ID */
  id: string
  /** 节点标题 */
  title: string
  /** 图标标识符 */
  icon: string
  /** 节点类型 */
  nodeKind: NavNodeKind
  /** 节点后是否显示分割线 */
  dividerAfter: boolean
  /** 描述文本 */
  description: string
  /** 页面路径 */
  path: string
  /** 重定向目标 */
  redirect: string
  /** 外链打开方式 */
  linkTarget: LinkTarget
  /** 父页面 ID */
  parentPageId: string
  /** 子节点布局位置（字符串，编辑期可能包含非法值） */
  childPlacement: string
  /** 排序权重 */
  order: number
  /** 是否隐藏 */
  hidden: boolean
  /** 是否禁用 */
  disabled: boolean
  /** 引用节点 ID */
  refId: string
  /** 权限模式 */
  permissionMode: NavPermissionMode
}

/** 导航上下文草稿配置 */
export type NavigationContextDraftConfig = {
  /** 占位提示 */
  placeholder: string
  /** 默认值 */
  defaultValue: string
  /** 参数名 */
  paramName: string
}

/** 导航上下文草稿：包含是否有上下文、选项列表和配置 */
export type NavigationContextDraft = {
  /** 是否启用了动态上下文 */
  hasContext: boolean
  /** 上下文选项列表 */
  items: Array<{ id: string; title: string }>
  /** 上下文配置 */
  config: NavigationContextDraftConfig
}

/** 完整的节点草稿输入：节点草稿 + 上下文草稿 */
export type NavigationNodeDraftInput = {
  /** 节点表单草稿 */
  draft: NavigationNodeDraft
  /** 动态上下文草稿 */
  context: NavigationContextDraft
}

/** 应用节点草稿后的结果：生成的补丁 + 警告列表 */
export type NavigationNodeDraftApplyResult = {
  /** 应用到 NavNode 的补丁 */
  patch: Partial<NavNode> & Pick<NavNode, 'id' | 'title' | 'nodeKind'>
  /** 应用过程中产生的警告（如自引用警告） */
  warnings: string[]
}

// ═══════════════════════════════════════════════════════
// 2. 树遍历辅助
// ═══════════════════════════════════════════════════════

/** 节点在树中的位置：节点自身、父节点、父 ID、在兄弟中的索引 */
export type NavNodeLocation = {
  /** 目标节点 */
  node: NavNode
  /** 父节点（顶层节点时为 null） */
  parent: NavNode | null
  /** 父节点 ID */
  parentId: string | null
  /** 在父节点 children 数组中的索引 */
  index: number
}

// ═══════════════════════════════════════════════════════
// 3. 常量表
// ═══════════════════════════════════════════════════════

/** 各节点类型的默认图标映射 */
export const DEFAULT_NAV_ICON_BY_KIND: Record<NavNodeKind, string> = {
  'system-directory': 'FolderOpened',
  'module': 'FolderOpened',
  'system-page': 'Monitor',
  'system-action': 'Lightning',
  'page': 'Document',
  'link': 'Link',
  'sub-page': 'Document',
  'ref': 'Connection',
}

// ═══════════════════════════════════════════════════════
// 4. 类型守卫与判断
// ═══════════════════════════════════════════════════════

function isNavContextConfig(value: string | NavContextItem[] | NavContextConfig | undefined): value is NavContextConfig {
  return typeof value === 'object' && !Array.isArray(value) && 'source' in value
}

const CHILD_PLACEMENT_VALUES: ReadonlySet<string> = new Set(['header', 'sidebar', 'toolbar', 'user-menu', 'parent', 'flat'])

function isChildPlacement(value: string): value is ChildPlacement {
  return CHILD_PLACEMENT_VALUES.has(value)
}

function isRootChildPlacement(value: string): value is 'header' | 'sidebar' {
  return value === 'header' || value === 'sidebar'
}

const SYSTEM_CHILD_PLACEMENTS = new Set(['toolbar', 'user-menu'])

// ═══════════════════════════════════════════════════════
// 5. 节点正规化
//
// 将不完整或不规范的 NavNode / AppNavRoot 转为合法形态。
// ═══════════════════════════════════════════════════════

/** 从路径字符串中提取页面 ID */
export function normalizePageIdFromPath(path: string | undefined | null): string {
  return path ? path.replace(/^\/+/, '').trim() : ''
}

/** 判断节点类型是否为可配置的页面节点 */
export function isConfigNodeKind(nodeKind: NavNodeKind): boolean {
  return nodeKind === 'page' || nodeKind === 'sub-page'
}

/** 判断节点类型是否为页面类（含系统页面、操作、外链等） */
export function isPageLikeKind(kind: NavNodeKind): boolean {
  return kind === 'page'
    || kind === 'system-page'
    || kind === 'system-action'
    || kind === 'link'
    || kind === 'sub-page'
}

/** 根据现有字段推断节点类型 */
export function inferNavNodeKind(node: NavNode, parentPlacement?: string): NavNodeKind {
  if (node.nodeKind !== undefined) return node.nodeKind
  if (parentPlacement !== undefined && SYSTEM_CHILD_PLACEMENTS.has(parentPlacement)) return 'system-action'
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab' || node.linkTarget === 'self') return 'link'
  return 'page'
}

/** 深拷贝并正规化单个导航节点 */
export function normalizeNavNode(node: NavNode, parentPlacement?: string): NavNode {
  const cloned = deepClone(node)
  cloned.nodeKind = inferNavNodeKind(cloned, parentPlacement)
  if (cloned.nodeKind === 'sub-page') {
    cloned.hidden = true
    delete cloned.path
    delete cloned.redirect
    delete cloned.linkTarget
  } else if (cloned.nodeKind === 'link') {
    delete cloned.redirect
    delete cloned.parentPageId
    if (cloned.linkTarget !== 'iframe' && cloned.linkTarget !== 'new-tab' && cloned.linkTarget !== 'self') {
      cloned.linkTarget = 'iframe'
    }
  } else {
    delete cloned.linkTarget
  }
  if (Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map(child => normalizeNavNode(child, cloned.childPlacement))
  }
  return cloned
}

/** 正规化根节点 childPlacement 值，非法值回退为 'header' */
export function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
  const normalized = String(value ?? '').trim()
  return isRootChildPlacement(normalized) ? normalized : 'header'
}

/** 正规化完整的导航根节点 */
export function normalizeNavRoot(config: {
  id?: string
  title?: string
  description?: string
  version?: string
  childPlacement?: string
  children?: NavNode[]
  homePath?: string
}): AppNavRoot {
  const root: AppNavRoot = {
    title: config.title ?? '',
    childPlacement: normalizeRootChildPlacement(config.childPlacement),
    children: (config.children ?? []).map(node => normalizeNavNode(node)),
  }
  const id = typeof config.id === 'string' ? config.id.trim() : ''
  const description = typeof config.description === 'string' ? config.description.trim() : ''
  const version = typeof config.version === 'string' ? config.version.trim() : ''
  const homePath = typeof config.homePath === 'string' ? config.homePath.trim() : ''
  if (id) root.id = id
  if (description) root.description = description
  if (version) root.version = version
  if (homePath) root.homePath = homePath
  return root
}

/** 构建导航根节点 */
export function buildNavRoot(children: NavNode[], options?: Partial<Omit<AppNavRoot, 'children'>>): AppNavRoot {
  return normalizeNavRoot({
    title: options?.title ?? '',
    childPlacement: options?.childPlacement ?? 'header',
    ...(options?.homePath !== undefined ? { homePath: options.homePath } : {}),
    children,
  })
}

// ═══════════════════════════════════════════════════════
// 6. 树查找
//
// 在导航树中按 ID 或 pageId 定位节点。
// ═══════════════════════════════════════════════════════

/** 按 ID 查找节点（深度优先） */
export function findNodeById(nodes: readonly NavNode[], targetId: string): NavNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

/** 按 ID 查找节点的父节点 */
export function findParentNodeById(nodes: readonly NavNode[], targetId: string, parent: NavNode | null = null): NavNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent
    if (Array.isArray(node.children)) {
      const found = findParentNodeById(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

/** 查找节点及其在树中的位置 */
export function findNodeLocation(nodes: readonly NavNode[], targetId: string, parent: NavNode | null = null): NavNodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node === undefined) continue
    if (node.id === targetId) {
      return { node, parent, parentId: parent?.id ?? null, index }
    }
    if (Array.isArray(node.children)) {
      const found = findNodeLocation(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

/** 按 pageId 查找可配置的页面节点 */
export function findConfigNodeByPageId(nodes: readonly NavNode[], pageId: string): NavNode | null {
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

/** 判断节点是否为顶层系统目录 */
export function isSystemRootDirectory(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
  return Boolean(node?.nodeKind === 'system-directory' && rootNodes.some(rootNode => rootNode.id === node.id))
}

/** 判断节点是否可以使用 module 类型（父节点不是页面类） */
export function canUseModuleNodeKind(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
  if (!node) return true
  const parent = findParentNodeById(rootNodes, node.id)
  if (!parent) return true
  return !isPageLikeKind(parent.nodeKind ?? 'module')
}

/** 获取节点类型的默认图标 */
export function defaultNavIconByKind(kind: NavNodeKind): string {
  return DEFAULT_NAV_ICON_BY_KIND[kind]
}

// ═══════════════════════════════════════════════════════
// 7. 草稿操作
//
// NavNode ↔ NavigationNodeDraft 双向转换 + 补丁应用。
// ═══════════════════════════════════════════════════════

function emptyContextConfig(): NavigationContextDraftConfig {
  return { placeholder: '', defaultValue: '', paramName: '' }
}

function normalizeContextItems(items: readonly NavContextItem[]): Array<{ id: string; title: string }> {
  return items.map(item => ({ id: String(item.id), title: item.title }))
}

/** 从 NavNode 创建编辑器草稿 */
export function createNavigationNodeDraft(node: NavNode): NavigationNodeDraftInput {
  const draft: NavigationNodeDraft = {
    id: node.id,
    title: node.title,
    icon: node.icon ?? defaultNavIconByKind(node.nodeKind ?? 'page'),
    nodeKind: node.nodeKind ?? 'page',
    dividerAfter: node.dividerAfter ?? false,
    description: node.description ?? '',
    path: node.path ?? '',
    redirect: node.redirect ?? '',
    linkTarget: node.linkTarget === 'new-tab' || node.linkTarget === 'self' ? node.linkTarget : 'iframe',
    parentPageId: node.parentPageId ?? '',
    refId: node.refId ?? '',
    childPlacement: node.childPlacement ?? '',
    order: node.order ?? 0,
    hidden: node.hidden ?? false,
    disabled: node.disabled ?? false,
    permissionMode: node.permissionMode ?? 'masked',
  }

  if (node.context === undefined) {
    return {
      draft,
      context: { hasContext: false, items: [], config: emptyContextConfig() },
    }
  }

  if (Array.isArray(node.context)) {
    return {
      draft,
      context: {
        hasContext: true,
        items: normalizeContextItems(node.context),
        config: emptyContextConfig(),
      },
    }
  }

  if (isNavContextConfig(node.context)) {
    const source = node.context.source
    return {
      draft,
      context: {
        hasContext: true,
        items: Array.isArray(source) ? normalizeContextItems(source) : [],
        config: {
          placeholder: node.context.placeholder ?? '',
          defaultValue: node.context.defaultValue !== undefined
            ? String(node.context.defaultValue)
            : '',
          paramName: node.context.paramName ?? '',
        },
      },
    }
  }

  return {
    draft,
    context: { hasContext: false, items: [], config: emptyContextConfig() },
  }
}

/** 切换草稿节点类型时重置相关字段 */
export function applyNodeKindPresetToDraft(draft: NavigationNodeDraft, kind: NavNodeKind): NavigationNodeDraft {
  const next = { ...draft }
  const previousKind = next.nodeKind
  next.nodeKind = kind

  const previousDefault = defaultNavIconByKind(previousKind)
  const nextDefault = defaultNavIconByKind(kind)
  if (!next.icon || next.icon === previousDefault) {
    next.icon = nextDefault
  }

  if (kind === 'system-directory') {
    next.hidden = false
    next.path = ''
    next.redirect = ''
    next.linkTarget = 'iframe'
    next.parentPageId = ''
    return next
  }
  if (kind === 'module') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    next.parentPageId = ''
    return next
  }
  if (kind === 'system-page' || kind === 'page') {
    next.hidden = false
    next.linkTarget = 'iframe'
    next.parentPageId = ''
    return next
  }
  if (kind === 'link') {
    next.hidden = false
    next.path = ''
    next.redirect = ''
    next.parentPageId = ''
    next.refId = ''
    return next
  }
  if (kind === 'ref') {
    next.hidden = false
    next.path = ''
    next.redirect = ''
    next.linkTarget = 'iframe'
    next.parentPageId = ''
    return next
  }

  next.hidden = true
  next.path = ''
  next.redirect = ''
  next.linkTarget = 'iframe'
  return next
}

/** 将草稿输入转为 NavNode 补丁（不修改原始节点） */
export function createNavigationNodePatch(input: NavigationNodeDraftInput): NavigationNodeDraftApplyResult {
  const draft = { ...input.draft }
  const warnings: string[] = []

  if (draft.nodeKind === 'sub-page') {
    draft.hidden = true
    draft.path = ''
    draft.redirect = ''
    draft.linkTarget = 'iframe'
  } else if (draft.nodeKind === 'link') {
    draft.redirect = ''
    draft.parentPageId = ''
  } else if (draft.nodeKind === 'ref') {
    draft.path = ''
    draft.redirect = ''
    draft.linkTarget = 'iframe'
    draft.parentPageId = ''
  } else if (draft.nodeKind === 'system-page' || draft.nodeKind === 'page') {
    draft.linkTarget = 'iframe'
    draft.parentPageId = ''
  }

  const patch: Partial<NavNode> & Pick<NavNode, 'id' | 'title' | 'nodeKind'> = {
    id: draft.id,
    title: draft.title,
    nodeKind: draft.nodeKind,
  }

  if (draft.icon) patch.icon = draft.icon
  if (draft.dividerAfter) patch.dividerAfter = true
  if (draft.description) patch.description = draft.description
  if (draft.path) patch.path = draft.path
  if (draft.redirect) patch.redirect = draft.redirect
  if (draft.nodeKind === 'link') patch.linkTarget = draft.linkTarget
  if (draft.nodeKind === 'ref' && draft.refId) {
    if (draft.refId === draft.id) {
      warnings.push('不能引用自身，已忽略 refId')
    } else {
      patch.refId = draft.refId
    }
  }
  if (draft.parentPageId) patch.parentPageId = draft.parentPageId
  if (draft.childPlacement && isChildPlacement(draft.childPlacement)) patch.childPlacement = draft.childPlacement
  if (draft.hidden !== false) patch.hidden = draft.hidden
  if (draft.disabled !== false) patch.disabled = draft.disabled
  patch.permissionMode = draft.permissionMode

  if (input.context.hasContext && input.context.items.length > 0) {
    const items = input.context.items.filter(item => item.id && item.title)
    if (items.length > 0) {
      if (
        input.context.config.placeholder
        || input.context.config.defaultValue
        || input.context.config.paramName
      ) {
        const ctx: NavContextConfig = { source: items }
        if (input.context.config.placeholder) ctx.placeholder = input.context.config.placeholder
        if (input.context.config.defaultValue) ctx.defaultValue = input.context.config.defaultValue
        if (input.context.config.paramName) ctx.paramName = input.context.config.paramName
        patch.context = ctx
      } else {
        patch.context = items
      }
    }
  }

  return { patch, warnings }
}

/** 将草稿补丁应用到已有 NavNode 实例 */
export function applyNavigationNodeDraftToNode(node: NavNode, input: NavigationNodeDraftInput): NavigationNodeDraftApplyResult {
  const result = createNavigationNodePatch(input)
  if (!('icon' in result.patch)) delete node.icon
  if (!('description' in result.patch)) delete node.description
  if (!('path' in result.patch)) delete node.path
  if (!('redirect' in result.patch)) delete node.redirect
  if (!('linkTarget' in result.patch)) delete node.linkTarget
  if (!('parentPageId' in result.patch)) delete node.parentPageId
  if (!('childPlacement' in result.patch)) delete node.childPlacement
  if (!('hidden' in result.patch)) delete node.hidden
  if (!('disabled' in result.patch)) delete node.disabled
  if (!('context' in result.patch)) delete node.context
  if (!('dividerAfter' in result.patch)) delete node.dividerAfter
  if (!('nodeKind' in result.patch)) delete node.nodeKind
  if (!('refId' in result.patch)) delete node.refId
  if (!('permissionMode' in result.patch)) delete node.permissionMode
  Object.assign(node, result.patch)
  return result
}

// ═══════════════════════════════════════════════════════
// 8. 节点工厂
//
// 创建新节点时的默认模板。
// ═══════════════════════════════════════════════════════

/** 创建根模块节点 */
export function createRootModuleNode(createId: () => string): NavNode {
  return {
    id: createId(),
    nodeKind: 'module',
    title: '新模块',
    icon: 'FolderOpened',
    childPlacement: 'sidebar',
    children: [],
  }
}

/** 创建子页面节点 */
export function createChildPageNode(createId: () => string): NavNode {
  const id = createId()
  return {
    id,
    nodeKind: 'page',
    title: '新页面',
    icon: defaultNavIconByKind('page'),
    path: `/${id}`,
  }
}

/** 创建保留区域根分组（工具栏 / 用户菜单） */
export function createReservedRootGroup(
  placement: 'toolbar' | 'user-menu',
  options: { createId: () => string; templateRoot?: AppNavRoot | null },
): NavNode {
  const template = options.templateRoot?.children.find(node => node.childPlacement === placement)
  if (template) {
    const cloned = deepClone(template)
    cloned.id = options.createId()
    return normalizeNavNode(cloned)
  }

  if (placement === 'toolbar') {
    return {
      id: options.createId(),
      nodeKind: 'system-directory',
      title: '工具栏',
      icon: 'SetUp',
      childPlacement: 'toolbar',
      children: [],
    }
  }

  return {
    id: options.createId(),
    nodeKind: 'system-directory',
    title: '用户菜单',
    icon: 'User',
    childPlacement: 'user-menu',
    children: [],
  }
}

// ═══════════════════════════════════════════════════════
// 9. 编辑会话
//
// 内存中持有导航根节点的编辑状态，
// 提供查找、替换等操作方法。
// ═══════════════════════════════════════════════════════

/** 导航编辑会话：持有 AppNavRoot 的内存快照，提供查找和替换操作 */
export class NavigationEditSession {
  private rootValue: AppNavRoot = normalizeNavRoot({ title: '', childPlacement: 'header', children: [] })

  /** 当前根节点快照 */
  get root(): AppNavRoot {
    return this.rootValue
  }

  /** 根节点的子节点列表 */
  get children(): NavNode[] {
    return this.rootValue.children
  }

  /** 替换整个根节点 */
  replaceRoot(root: Partial<AppNavRoot> & { children?: NavNode[] }): AppNavRoot {
    this.rootValue = normalizeNavRoot(root)
    return this.rootValue
  }

  /** 替换根节点的所有子节点 */
  replaceChildren(children: NavNode[], options?: Partial<Omit<AppNavRoot, 'children'>>): AppNavRoot {
    this.rootValue = buildNavRoot(children, options)
    return this.rootValue
  }

  /** 按 ID 查找节点 */
  findNode(id: string): NavNode | null {
    return findNodeById(this.rootValue.children, id)
  }

  /** 查找节点在树中的位置 */
  findLocation(id: string): NavNodeLocation | null {
    return findNodeLocation(this.rootValue.children, id)
  }
}
