/** 节点纯函数——tree/flat 转换、pageId 解析、类型判断。 */
import { deepClone } from '@spark-appworks/spark-utils'
import type {
  NavNodeKind,
  ProjectPageSurface,
  ProjectDescriptionContext,
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from './node'

export function normalizePid(v: string | null | undefined): string { return v?.trim() ?? '' }

export function normalizePageIdFromPath(path: string | undefined | null): string {
  return path ? path.replace(/^\/+/, '').trim() : ''
}

export function isConfigNodeKind(kind: string | undefined | null): boolean { return (kind ?? 'page') === 'page' || kind === 'sub-page' }

/** 按 nodeKind 解析模型侧页面表面（不依赖应用路由表）。 */
export function resolveProjectPageSurface(node: ProjectNodeData): ProjectPageSurface {
  const kind = node.nodeKind ?? 'page'
  if (isConfigNodeKind(kind)) return 'config-files'
  if (kind === 'system-page') return 'system-page'
  if (kind === 'link') return 'link'
  if (kind === 'ref') return 'ref'
  return 'none'
}

export function isConfigFilesPageSurface(surface: ProjectPageSurface): boolean {
  return surface === 'config-files'
}
const SYSTEM_CHILD_PLACEMENTS = new Set(['toolbar', 'user-menu'])

function inferNavNodeKind(node: ProjectNodeData, parentPlacement?: string): NavNodeKind {
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

function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
  const normalized = String(value ?? '').trim()
  return normalized === 'header' || normalized === 'sidebar' ? normalized : 'header'
}

type NormalizeNavRootInput = {
  id?: string | undefined
  title?: string | undefined
  childPlacement?: string | undefined
  children?: ProjectNodeData[] | undefined
  icon?: string | undefined
  description?: string | undefined
  version?: string | undefined
  nodeKind?: 'module' | 'system-directory' | undefined
  homePath?: string | undefined
}

export function normalizeNavRoot(config: NormalizeNavRootInput): ProjectModelData {
  const promoted = promotePersistedRoot(config)
  const root: ProjectModelData = {
    ...(promoted.id === undefined || promoted.id.trim() === '' ? {} : { id: promoted.id.trim() }),
    title: promoted.title ?? '',
    ...(promoted.icon === undefined || promoted.icon.trim() === '' ? {} : { icon: promoted.icon.trim() }),
    ...(promoted.description === undefined || promoted.description.trim() === '' ? {} : { description: promoted.description }),
    ...(promoted.version === undefined || promoted.version.trim() === '' ? {} : { version: promoted.version.trim() }),
    ...(promoted.homePath === undefined || promoted.homePath.trim() === '' ? {} : { homePath: promoted.homePath.trim() }),
    nodeKind: promoted.nodeKind ?? 'module',
    childPlacement: normalizeRootChildPlacement(promoted.childPlacement),
    children: (promoted.children ?? []).map(node => normalizeProjectNodeData(node)),
  }
  return root
}

function promotePersistedRoot(config: NormalizeNavRootInput): NormalizeNavRootInput {
  const rootId = config.id?.trim()
  const children = config.children ?? []
  if (rootId || children.length === 0) return config

  const candidate = findPersistedRootCandidate(children)
  if (!isPersistedRootCandidate(candidate)) return config

  const nestedChildren = candidate.children ?? []
  const siblingChildren = children.filter(node => node.id !== candidate.id)
  return {
    ...config,
    id: candidate.id,
    title: candidate.title,
    icon: candidate.icon,
    description: candidate.description,
    version: candidate.version,
    nodeKind: candidate.nodeKind === 'system-directory' ? 'system-directory' : 'module',
    childPlacement: candidate.childPlacement ?? config.childPlacement,
    children: [...nestedChildren, ...siblingChildren],
  }
}

function findPersistedRootCandidate(children: readonly ProjectNodeData[]): ProjectNodeData | undefined {
  const candidates = children.filter(isPersistedRootCandidate)
  return candidates.find(node => node.childPlacement === 'header' || node.childPlacement === 'sidebar')
    ?? candidates.find(node => !node.path && !node.linkTarget)
    ?? candidates[0]
}

function isPersistedRootCandidate(node: ProjectNodeData | undefined): node is ProjectNodeData {
  if (!node) return false
  if (node.nodeKind !== 'module' && node.nodeKind !== 'system-directory') return false
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return false
  return true
}

export function buildNavRoot(children: ProjectNodeData[], options?: Partial<Omit<ProjectModelData, 'children'>>): ProjectModelData {
  return normalizeNavRoot({
    id: options?.id,
    title: options?.title ?? '',
    icon: options?.icon,
    description: options?.description,
    version: options?.version,
    nodeKind: options?.nodeKind,
    homePath: options?.homePath,
    childPlacement: options?.childPlacement ?? 'header',
    children,
  })
}

function isPageLikeKind(kind: NavNodeKind): boolean {
  return kind === 'page'
    || kind === 'system-page'
    || kind === 'system-action'
    || kind === 'link'
    || kind === 'sub-page'
}

export function findNodeById(nodes: readonly ProjectNodeData[], targetId: string): ProjectNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

function findParentNodeById(nodes: readonly ProjectNodeData[], targetId: string, parent: ProjectNodeData | null = null): ProjectNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent
    if (Array.isArray(node.children)) {
      const found = findParentNodeById(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

export function findNodeLocation(nodes: readonly ProjectNodeData[], targetId: string, parent: ProjectNodeData | null = null): ProjectNodeLocation | null {
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

export function findConfigNodeByPageId(nodes: readonly ProjectNodeData[], pageId: string): ProjectNodeData | null {
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

export function findPageNodeByPageId(nodes: readonly ProjectNodeData[], pageId: string): ProjectNodeData | null {
  const normalized = pageId.trim()
  if (!normalized) return null
  for (const node of nodes) {
    if (resolvePageNodePageId(node) === normalized) return node
    const found = findPageNodeByPageId(node.children ?? [], normalized)
    if (found !== null) return found
  }
  return null
}

export function isSystemRootDirectory(node: ProjectNodeData | null | undefined, rootNodes: readonly ProjectNodeData[]): boolean {
  return Boolean(node?.nodeKind === 'system-directory' && rootNodes.some(rootNode => rootNode.id === node.id))
}

export function canUseModuleNodeKind(node: ProjectNodeData | null | undefined, rootNodes: readonly ProjectNodeData[]): boolean {
  if (!node) return true
  const parent = findParentNodeById(rootNodes, node.id)
  if (!parent) return true
  return !isPageLikeKind(parent.nodeKind ?? 'module')
}

export function normalizeConfigPageId(v: string | undefined | null): string { return (v ?? '').trim() }

export function resolvePageNodePageId(node: ProjectNodeData | null | undefined): string {
  if (!node || !isConfigNodeKind(node.nodeKind ?? 'page')) return ''
  const pid = normalizePageIdFromPath(node.path)
  return pid || node.id.trim()
}

/** 导航树页面摘要用的 pageId（含配置页与 system-page）。 */
export function resolveNavPageSummaryId(node: ProjectNodeData): string {
  const configPageId = resolvePageNodePageId(node)
  if (configPageId !== '') return configPageId
  if (node.nodeKind === 'system-page') {
    return normalizePageIdFromPath(node.path) || node.id.trim()
  }
  return ''
}

export function readProjectNodeDescription(node: ProjectNodeData | null | undefined): string { return node?.description?.trim() ?? '' }

function createProjectDescriptionContext(node: ProjectNodeData | null | undefined): ProjectDescriptionContext | null {
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

type BuildProjectPageSummariesOptions = {
  descriptionContext?: readonly ProjectDescriptionContext[]
}

export function buildProjectPageSummaries(
  nodes: readonly ProjectNodeData[],
  options: BuildProjectPageSummariesOptions = {},
): ProjectPageNodeSummary[] {
  const pages: ProjectPageNodeSummary[] = []
  const seen = new Set<string>()

  const visit = (
    list: readonly ProjectNodeData[],
    context: readonly ProjectDescriptionContext[],
  ): void => {
    for (const node of list) {
      const nextContext = appendProjectDescriptionContext(context, node)
      const surface = resolveProjectPageSurface(node)
      const pageId = resolveNavPageSummaryId(node)
      if (pageId !== '' && (surface === 'config-files' || surface === 'system-page') && !seen.has(pageId)) {
        const description = readProjectNodeDescription(node)
        seen.add(pageId)
        pages.push({
          pageId,
          path: node.path ?? `/${pageId}`,
          title: node.title,
          nodeId: node.id,
          nodeKind: node.nodeKind ?? 'page',
          designSurface: surface,
          description,
          descriptionContext: nextContext,
          effectiveDescription: formatProjectDescriptionContext(nextContext),
          ...(node.icon !== undefined ? { icon: node.icon } : {}),
        })
      }
      visit(node.children ?? [], nextContext)
    }
  }

  visit(nodes, options.descriptionContext ?? [])
  return pages
}

export function flattenProjectNavigationRoot(root: ProjectModelData): Array<{ node: ProjectNodeData; pid: string }> {
  const normalizedRoot = normalizeNavRoot(root)
  const rootId = normalizedRoot.id?.trim()
  if (!rootId) {
    throw new Error('导航 root.id 不能为空')
  }
  const r: Array<{ node: ProjectNodeData; pid: string }> = []
  const visit = (nodes: readonly ProjectNodeData[], pid: string): void => {
    for (const n of nodes) { r.push({ node: n, pid }); visit(Array.isArray(n.children) ? n.children : [], n.id); delete n.children }
  }
  const rootNode: ProjectNodeData = { ...normalizedRoot, id: rootId, nodeKind: normalizedRoot.nodeKind ?? 'module' }
  r.push({ node: rootNode, pid: '' })
  visit(rootNode.children ?? [], rootId)
  delete rootNode.children
  return r
}

/** 树节点最小接口——避免循环依赖 */
type TreeNodeLike = {
  readonly id: string
  readonly pid: string
  toNodeData(): ProjectNodeData
}

export function buildProjectNavigationTree(nodes: Iterable<TreeNodeLike>): ProjectNodeData[] {
  const byParent = new Map<string, ProjectNodeData[]>()
  for (const model of nodes) {
    const data = { ...model.toNodeData() }
    delete data.children
    const bucket = byParent.get(model.pid) ?? []
    bucket.push(data)
    byParent.set(model.pid, bucket)
  }
  for (const bucket of byParent.values()) {
    sortNavNodes(bucket)
  }
  const attachChildren = (node: ProjectNodeData): void => {
    const children = byParent.get(node.id) ?? []
    if (children.length === 0) return
    node.children = children
    for (const child of children) attachChildren(child)
  }
  const roots = byParent.get('') ?? []
  sortNavNodes(roots)
  for (const root of roots) attachChildren(root)
  return roots
}

export function findFlatNodeLocation<T extends TreeNodeLike>(
  nodesById: ReadonlyMap<string, T>,
  getChildren: (pid: string) => readonly T[],
  targetId: string,
): ProjectNodeLocation | null {
  const normalized = targetId.trim()
  const model = nodesById.get(normalized)
  if (!model) return null
  const node = model.toNodeData()
  const pid = model.pid.trim()
  const parentModel = pid ? nodesById.get(pid) : undefined
  const parent = parentModel?.toNodeData() ?? null
  const siblings = getChildren(pid)
  const index = siblings.findIndex((sibling) => sibling.id === normalized)
  return {
    node,
    parent,
    parentId: parent?.id ?? null,
    index: index >= 0 ? index : 0,
  }
}

function sortNavNodes(nodes: ProjectNodeData[]): ProjectNodeData[] {
  return nodes.sort((a, b) => { const oa = typeof a.order === 'number' ? a.order : 0; const ob = typeof b.order === 'number' ? b.order : 0; return oa !== ob ? oa - ob : a.id.localeCompare(b.id) })
}

// ── NavigationIndex：内存索引，非存储形状 ────────────────────────────────

export type NavigationTreeNodeLike = {
  readonly id: string
  readonly pid: string
  readonly order: number
  toNodeData(): ProjectNodeData
}

export function compareNavigationNodes(
  a: NavigationTreeNodeLike,
  b: NavigationTreeNodeLike,
): number {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
}

export class NavigationIndex<TNode extends NavigationTreeNodeLike> {
  private readonly nodesById: Map<string, TNode>
  private childrenByPid = new Map<string, TNode[]>()
  private treeCache: ProjectNodeData[] | null = null

  constructor(nodesById: Map<string, TNode>) {
    this.nodesById = nodesById
  }

  rebuild(): void {
    this.childrenByPid.clear()
    this.treeCache = null
    for (const node of this.nodesById.values()) {
      const pid = node.pid
      let bucket = this.childrenByPid.get(pid)
      if (!bucket) {
        bucket = []
        this.childrenByPid.set(pid, bucket)
      }
      bucket.push(node)
    }
    for (const bucket of this.childrenByPid.values()) {
      bucket.sort(compareNavigationNodes)
    }
  }

  invalidateTree(): void {
    this.treeCache = null
  }

  getChildren(pid: string): readonly TNode[] {
    return this.childrenByPid.get(pid.trim()) ?? []
  }

  collectDescendants(nodeId: string): TNode[] {
    const result: TNode[] = []
    const stack = [...this.getChildren(nodeId)]
    while (stack.length > 0) {
      const node = stack.pop()
      if (node === undefined) continue
      result.push(node)
      stack.push(...this.getChildren(node.id))
    }
    return result
  }

  nextChildOrder(pid: string): number {
    const siblings = this.getChildren(pid)
    let max = -1
    for (const node of siblings) max = Math.max(max, node.order)
    return max + 1
  }

  buildTree(): ProjectNodeData[] {
    if (this.treeCache !== null) return this.treeCache
    this.treeCache = buildProjectNavigationTree(this.nodesById.values())
    return this.treeCache
  }

  findNodeLocation(targetId: string): ProjectNodeLocation | null {
    return findFlatNodeLocation(this.nodesById, (pid) => this.getChildren(pid), targetId)
  }
}
