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

export interface NavigationNodeDraft {
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
  permissionMode: NavPermissionMode
}

export interface NavigationContextDraftConfig {
  placeholder: string
  defaultValue: string
  paramName: string
}

export interface NavigationContextDraft {
  hasContext: boolean
  items: Array<{ id: string; title: string }>
  config: NavigationContextDraftConfig
}

export interface NavigationNodeDraftInput {
  draft: NavigationNodeDraft
  context: NavigationContextDraft
}

export interface NavigationNodeDraftApplyResult {
  patch: Partial<NavNode> & Pick<NavNode, 'id' | 'title' | 'nodeKind'>
  warnings: string[]
}

export interface NavNodeLocation {
  node: NavNode
  parent: NavNode | null
  parentId: string | null
  index: number
}

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

const ROOT_CHILD_PLACEMENTS = new Set(['header', 'sidebar'])
const SYSTEM_CHILD_PLACEMENTS = new Set(['toolbar', 'user-menu'])

export function defaultNavIconByKind(kind: NavNodeKind): string {
  return DEFAULT_NAV_ICON_BY_KIND[kind]
}

export function normalizePageIdFromPath(path: string | undefined | null): string {
  return path ? path.replace(/^\/+/, '').trim() : ''
}

export function isConfigNodeKind(nodeKind: NavNodeKind): boolean {
  return nodeKind === 'page' || nodeKind === 'sub-page'
}

export function isPageLikeKind(kind: NavNodeKind): boolean {
  return kind === 'page'
    || kind === 'system-page'
    || kind === 'system-action'
    || kind === 'link'
    || kind === 'sub-page'
}

export function inferNavNodeKind(node: NavNode, parentPlacement?: string): NavNodeKind {
  if (node.nodeKind !== undefined) return node.nodeKind
  if (parentPlacement !== undefined && SYSTEM_CHILD_PLACEMENTS.has(parentPlacement)) return 'system-action'
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab') return 'link'
  return 'page'
}

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
    if (cloned.linkTarget !== 'iframe' && cloned.linkTarget !== 'new-tab') {
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

export function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
  return ROOT_CHILD_PLACEMENTS.has(String(value ?? '').trim())
    ? (value as 'header' | 'sidebar')
    : 'header'
}

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

export function buildNavRoot(children: NavNode[], options?: Partial<Omit<AppNavRoot, 'children'>>): AppNavRoot {
  return normalizeNavRoot({
    title: options?.title ?? '',
    childPlacement: options?.childPlacement ?? 'header',
    ...(options?.homePath !== undefined ? { homePath: options.homePath } : {}),
    children,
  })
}

export function findNodeById(nodes: NavNode[], targetId: string): NavNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

export function findParentNodeById(nodes: NavNode[], targetId: string, parent: NavNode | null = null): NavNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent
    if (Array.isArray(node.children)) {
      const found = findParentNodeById(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

export function findNodeLocation(nodes: NavNode[], targetId: string, parent: NavNode | null = null): NavNodeLocation | null {
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

export function findConfigNodeByPageId(nodes: NavNode[], pageId: string): NavNode | null {
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

export function isSystemRootDirectory(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
  return Boolean(node?.nodeKind === 'system-directory' && rootNodes.some(rootNode => rootNode.id === node.id))
}

export function canUseModuleNodeKind(node: NavNode | null | undefined, rootNodes: NavNode[]): boolean {
  if (!node) return true
  const parent = findParentNodeById(rootNodes, node.id)
  if (!parent) return true
  return !isPageLikeKind(parent.nodeKind ?? 'module')
}

function emptyContextConfig(): NavigationContextDraftConfig {
  return { placeholder: '', defaultValue: '', paramName: '' }
}

function normalizeContextItems(items: readonly NavContextItem[]): Array<{ id: string; title: string }> {
  return items.map(item => ({ id: String(item.id), title: item.title }))
}

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
    linkTarget: node.linkTarget === 'new-tab' ? 'new-tab' : 'iframe',
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

  if (typeof node.context === 'object') {
    const cfg = node.context as {
      source?: unknown
      placeholder?: string
      defaultValue?: unknown
      paramName?: string
    }
    return {
      draft,
      context: {
        hasContext: true,
        items: Array.isArray(cfg.source)
          ? normalizeContextItems(cfg.source as NavContextItem[])
          : [],
        config: {
          placeholder: cfg.placeholder ?? '',
          defaultValue: cfg.defaultValue !== null && cfg.defaultValue !== undefined ? String(cfg.defaultValue) : '',
          paramName: cfg.paramName ?? '',
        },
      },
    }
  }

  return {
    draft,
    context: { hasContext: false, items: [], config: emptyContextConfig() },
  }
}

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
  if (draft.childPlacement) patch.childPlacement = draft.childPlacement as ChildPlacement
  if (draft.order !== 0) patch.order = draft.order
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

export function applyNavigationNodeDraftToNode(node: NavNode, input: NavigationNodeDraftInput): NavigationNodeDraftApplyResult {
  const result = createNavigationNodePatch(input)
  if (!('icon' in result.patch)) delete node.icon
  if (!('description' in result.patch)) delete node.description
  if (!('path' in result.patch)) delete node.path
  if (!('redirect' in result.patch)) delete node.redirect
  if (!('linkTarget' in result.patch)) delete node.linkTarget
  if (!('parentPageId' in result.patch)) delete node.parentPageId
  if (!('childPlacement' in result.patch)) delete node.childPlacement
  if (!('order' in result.patch)) delete node.order
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

export class NavigationEditSession {
  private rootValue: AppNavRoot = normalizeNavRoot({ title: '', childPlacement: 'header', children: [] })

  get root(): AppNavRoot {
    return this.rootValue
  }

  get children(): NavNode[] {
    return this.rootValue.children
  }

  replaceRoot(root: Partial<AppNavRoot> & { children?: NavNode[] }): AppNavRoot {
    this.rootValue = normalizeNavRoot(root)
    return this.rootValue
  }

  replaceChildren(children: NavNode[], options?: Partial<Omit<AppNavRoot, 'children'>>): AppNavRoot {
    this.rootValue = buildNavRoot(children, options)
    return this.rootValue
  }

  findNode(id: string): NavNode | null {
    return findNodeById(this.rootValue.children, id)
  }

  findLocation(id: string): NavNodeLocation | null {
    return findNodeLocation(this.rootValue.children, id)
  }
}
