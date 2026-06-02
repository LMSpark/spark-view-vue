/** 节点纯函数——tree/flat 转换、pageId 解析、类型判断。 */
import { deepClone } from '@spark-view/spark-utils'
import type { NavNodeKind, ProjectModelData, ProjectNodeData } from './node-base.entity'
import type { NodeKind, ProjectDescriptionContext } from './module-node.entity'

export type ProjectNavigationFlatNode = {
  id: string; pid: string | null; title: string; description: string; nodeKind: NavNodeKind
  path: string; icon: string; dividerAfter: boolean; childPlacement: string
  linkTarget: string; hidden: boolean; disabled: boolean; order: number
  refId: string; permissionMode: string; node: ProjectNodeData
}

export function normalizePid(v: string | null | undefined): string | null { const n = v?.trim() ?? ''; return n || null }

export function normalizePageIdFromPath(path: string | undefined | null): string {
  return path ? path.replace(/^\/+/, '').trim() : ''
}

export function isConfigNodeKind(kind: string | undefined | null): boolean { return (kind ?? 'page') === 'page' || kind === 'sub-page' }
export function isProjectPageNodeKind(kind: string | undefined | null): kind is 'page' | 'sub-page' { return kind === 'page' || kind === 'sub-page' }
export function isProjectModuleNodeKind(kind: string | undefined | null): boolean { return kind === 'module' || kind === 'system-directory' }

const SYSTEM_CHILD_PLACEMENTS = new Set(['toolbar', 'user-menu'])

export function inferNavNodeKind(node: ProjectNodeData, parentPlacement?: string): NavNodeKind {
  if (node.nodeKind !== undefined) return node.nodeKind
  if (parentPlacement !== undefined && SYSTEM_CHILD_PLACEMENTS.has(parentPlacement)) return 'system-action'
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab' || node.linkTarget === 'self') return 'link'
  return 'page'
}

export function normalizeProjectNodeData(node: ProjectNodeData, parentPlacement?: string): ProjectNodeData {
  const cloned = deepClone(node)
  cloned.nodeKind = inferNavNodeKind(cloned, parentPlacement)
  if (cloned.nodeKind === 'sub-page') {
    cloned.hidden = true
    delete cloned.path
    delete cloned.linkTarget
  } else if (cloned.nodeKind === 'link') {
    if (cloned.linkTarget !== 'iframe' && cloned.linkTarget !== 'new-tab' && cloned.linkTarget !== 'self') {
      cloned.linkTarget = 'iframe'
    }
  } else {
    delete cloned.linkTarget
  }
  if (Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map(child => normalizeProjectNodeData(child, cloned.childPlacement))
  }
  return cloned
}

export function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
  const normalized = String(value ?? '').trim()
  return normalized === 'header' || normalized === 'sidebar' ? normalized : 'header'
}

type NormalizeNavRootInput = {
  id?: string | undefined
  title?: string | undefined
  description?: string | undefined
  version?: string | undefined
  childPlacement?: string | undefined
  children?: ProjectNodeData[] | undefined
  homePath?: string | undefined
}

export function normalizeNavRoot(config: NormalizeNavRootInput): ProjectModelData {
  const root: ProjectModelData = {
    title: config.title ?? '',
    childPlacement: normalizeRootChildPlacement(config.childPlacement),
    children: (config.children ?? []).map(node => normalizeProjectNodeData(node)),
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

export function buildNavRoot(children: ProjectNodeData[], options?: Partial<Omit<ProjectModelData, 'children'>>): ProjectModelData {
  return normalizeNavRoot({
    title: options?.title ?? '',
    childPlacement: options?.childPlacement ?? 'header',
    ...(options?.homePath !== undefined ? { homePath: options.homePath } : {}),
    children,
  })
}

export function readProjectEditNodeKind(node: ProjectNodeData | null | undefined): NodeKind | null {
  const k = node?.nodeKind ?? 'page'
  if (k === 'module' || k === 'system-directory') return 'module'
  if (k === 'page') return 'page'
  if (k === 'sub-page') return 'sub-page'
  return null
}

export function canProjectNodeContainChild(p: 'project' | NodeKind, c: NodeKind): boolean {
  if (p === 'project' || p === 'module') return c === 'module' || c === 'page'
  return c === 'sub-page'
}

export function readAllowedProjectEditChildKinds(p: 'project' | NodeKind): readonly NodeKind[] {
  if (p === 'project' || p === 'module') return ['module', 'page']
  return ['sub-page']
}

export function normalizeConfigPageId(v: string | undefined | null): string { return (v ?? '').trim() }
export function resolvePageIdFromProjectPath(path: string | undefined | null): string { return normalizePageIdFromPath(path) }

export function resolvePageNodePageId(node: ProjectNodeData | null | undefined): string {
  if (!node || !isConfigNodeKind(node.nodeKind ?? 'page')) return ''
  const pid = resolvePageIdFromProjectPath(node.path)
  return pid || node.id.trim()
}

export function readProjectNodeDescription(node: ProjectNodeData | null | undefined): string { return node?.description?.trim() ?? '' }

export function createProjectDescriptionContext(node: ProjectNodeData | null | undefined): ProjectDescriptionContext | null {
  const d = readProjectNodeDescription(node)
  if (!node || !d) return null
  return { nodeId: node.id, title: node.title, nodeKind: node.nodeKind ?? 'page', description: d }
}

export function appendProjectDescriptionContext(c: readonly ProjectDescriptionContext[], node: ProjectNodeData | null | undefined): ProjectDescriptionContext[] {
  const n = createProjectDescriptionContext(node)
  return n === null ? [...c] : [...c, n]
}

export function formatProjectDescriptionContext(c: readonly ProjectDescriptionContext[]): string {
  return c.map(i => `${i.title}: ${i.description}`).join('\n')
}

export function flattenProjectNavigationRoot(root: ProjectModelData): Array<{ node: ProjectNodeData; pid: string | null }> {
  const normalizedRoot = normalizeNavRoot(root)
  const r: Array<{ node: ProjectNodeData; pid: string | null }> = []
  const visit = (nodes: readonly ProjectNodeData[], pid: string | null): void => {
    for (const n of nodes) { r.push({ node: n, pid }); visit(Array.isArray(n.children) ? n.children : [], n.id); delete n.children }
  }
  visit(normalizedRoot.children, null)
  return r
}

/** 树节点最小接口——避免循环依赖 */
type TreeNodeLike = { readonly id: string; readonly pid: string | null; readonly node: ProjectNodeData }

export function buildProjectNavigationTree(nodes: readonly TreeNodeLike[]): ProjectNodeData[] {
  const byParent = new Map<string, ProjectNodeData[]>()
  for (const m of nodes) {
    const k = m.pid ?? ''; const c = { ...m.node }; delete c.children
    const s = byParent.get(k) ?? []; s.push(c); byParent.set(k, s)
  }
  for (const m of [...nodes].sort((a, b) => b.id.length - a.id.length)) {
    const children = byParent.get(m.id) ?? []
    if (children.length > 0) {
      const p = findProjectedNode(byParent.get(m.pid ?? '') ?? [], m.id)
      if (p) p.children = sortNavNodes(children)
    }
  }
  return sortNavNodes(byParent.get('') ?? [])
}

export function projectNavNodeToFlatRow(node: ProjectNodeData, pid: string | null): ProjectNavigationFlatNode {
  return { id: node.id, pid: normalizePid(pid), title: node.title, description: node.description ?? '',
    nodeKind: node.nodeKind ?? 'page', path: node.path ?? '', icon: node.icon ?? '',
    dividerAfter: node.dividerAfter === true, childPlacement: node.childPlacement ?? '',
    linkTarget: node.linkTarget ?? '', hidden: node.hidden === true, disabled: node.disabled === true,
    order: typeof node.order === 'number' ? node.order : 0, refId: node.refId ?? '',
    permissionMode: node.permissionMode ?? '', node }
}

function sortNavNodes(nodes: ProjectNodeData[]): ProjectNodeData[] {
  return nodes.sort((a, b) => { const oa = typeof a.order === 'number' ? a.order : 0; const ob = typeof b.order === 'number' ? b.order : 0; return oa !== ob ? oa - ob : a.id.localeCompare(b.id) })
}

function findProjectedNode(nodes: readonly ProjectNodeData[], id: string): ProjectNodeData | null {
  for (const n of nodes) { if (n.id === id) return n; const f = findProjectedNode(n.children ?? [], id); if (f) return f }
  return null
}

export function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }
