/** 节点纯函数——tree/flat 转换、pageId 解析、类型判断。 */
import type { AppNavRoot, NavNode, NavNodeKind } from '../../service/navigation/nav-model'
import { normalizeNavRoot, normalizePageIdFromPath } from '../../service/navigation/editing.service'
import type { NodeKind, ProjectDescriptionContext } from '../../contract/node.contract'

export type ProjectNavigationFlatNode = {
  id: string; pid: string | null; title: string; description: string; nodeKind: NavNodeKind
  path: string; icon: string; dividerAfter: boolean; childPlacement: string
  linkTarget: string; hidden: boolean; disabled: boolean; order: number
  refId: string; permissionMode: string; node: NavNode
}

export function normalizePid(v: string | null | undefined): string | null { const n = v?.trim() ?? ''; return n || null }

export function isConfigNodeKind(kind: string | undefined | null): boolean { return (kind ?? 'page') === 'page' || kind === 'sub-page' }
export function isProjectPageNodeKind(kind: string | undefined | null): kind is 'page' | 'sub-page' { return kind === 'page' || kind === 'sub-page' }
export function isProjectModuleNodeKind(kind: string | undefined | null): boolean { return kind === 'module' || kind === 'system-directory' }

export function readProjectEditNodeKind(node: NavNode | null | undefined): NodeKind | null {
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

export function resolvePageNodePageId(node: NavNode | null | undefined): string {
  if (!node || !isConfigNodeKind(node.nodeKind ?? 'page')) return ''
  const pid = resolvePageIdFromProjectPath(node.path)
  return pid || node.id.trim()
}

export function readProjectNodeDescription(node: NavNode | null | undefined): string { return node?.description?.trim() ?? '' }

export function createProjectDescriptionContext(node: NavNode | null | undefined): ProjectDescriptionContext | null {
  const d = readProjectNodeDescription(node)
  if (!node || !d) return null
  return { nodeId: node.id, title: node.title, nodeKind: node.nodeKind ?? 'page', description: d }
}

export function appendProjectDescriptionContext(c: readonly ProjectDescriptionContext[], node: NavNode | null | undefined): ProjectDescriptionContext[] {
  const n = createProjectDescriptionContext(node)
  return n === null ? [...c] : [...c, n]
}

export function formatProjectDescriptionContext(c: readonly ProjectDescriptionContext[]): string {
  return c.map(i => `${i.title}: ${i.description}`).join('\n')
}

export function flattenProjectNavigationRoot(root: AppNavRoot): Array<{ node: NavNode; pid: string | null }> {
  const normalizedRoot = normalizeNavRoot(root)
  const r: Array<{ node: NavNode; pid: string | null }> = []
  const visit = (nodes: readonly NavNode[], pid: string | null): void => {
    for (const n of nodes) { r.push({ node: n, pid }); visit(Array.isArray(n.children) ? n.children : [], n.id); delete n.children }
  }
  visit(normalizedRoot.children, null)
  return r
}

/** 树节点最小接口——避免循环依赖 */
type TreeNodeLike = { readonly id: string; readonly pid: string | null; readonly node: NavNode }

export function buildProjectNavigationTree(nodes: readonly TreeNodeLike[]): NavNode[] {
  const byParent = new Map<string, NavNode[]>()
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

export function projectNavNodeToFlatRow(node: NavNode, pid: string | null): ProjectNavigationFlatNode {
  return { id: node.id, pid: normalizePid(pid), title: node.title, description: node.description ?? '',
    nodeKind: node.nodeKind ?? 'page', path: node.path ?? '', icon: node.icon ?? '',
    dividerAfter: node.dividerAfter === true, childPlacement: node.childPlacement ?? '',
    linkTarget: node.linkTarget ?? '', hidden: node.hidden === true, disabled: node.disabled === true,
    order: typeof node.order === 'number' ? node.order : 0, refId: node.refId ?? '',
    permissionMode: node.permissionMode ?? '', node }
}

function sortNavNodes(nodes: NavNode[]): NavNode[] {
  return nodes.sort((a, b) => { const oa = typeof a.order === 'number' ? a.order : 0; const ob = typeof b.order === 'number' ? b.order : 0; return oa !== ob ? oa - ob : a.id.localeCompare(b.id) })
}

function findProjectedNode(nodes: readonly NavNode[], id: string): NavNode | null {
  for (const n of nodes) { if (n.id === id) return n; const f = findProjectedNode(n.children ?? [], id); if (f) return f }
  return null
}

export function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }
