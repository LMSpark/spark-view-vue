/**
 * Project node models.
 *
 * 后端真源是 NAVIGATION_NODE_FLAT：NODE_ID + PARENT_ID + 节点字段。
 * 前端 ProjectModel 同构保存为平铺节点集合；树形 children 只是 UI / legacy
 * navigation root 的投影。配置页节点直接承载 rule / dataSet / script / style，
 * 不再经过独立 PageNode 中间层。
 */

import type { DataSet, SparkNode } from '@spark-view/spark-data'
import { getSparkNodeChildren } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { AppNavRoot, NavNode, NavNodeKind } from '../page-model/navigation/nav-model'
import type {
  NavigationContextDraft,
  NavigationNodeDraft,
} from '../page-model/navigation/nav-editing'
import {
  normalizeNavRoot,
  normalizePageIdFromPath,
} from '../page-model/navigation/nav-editing'
import type { NavigationConfigClient } from '../page-model/navigation/nav-client'
import type { BasePageContentLoader } from '../page-model/read/page-content-types'
import type { PageNodeFileApi } from '../page-model/model/page-file-api'
import type { PageNodeFileCache } from '../page-model/model/page-file-cache'
import type { PageNodeFileName } from '../page-model/model/page-file-registry'
import { NavigationDraftModel } from '../page-model/model/navigation-draft-model'
import { PageDataSetModel } from '../page-model/model/page-data-set-model'
import { PageRuleModel } from '../page-model/model/page-rule-model'
import { PageTextModel } from '../page-model/model/page-text-model'

export type ProjectNodeFamily =
  | 'module'
  | 'config-page'
  | 'vue-page'
  | 'system-action'
  | 'link'
  | 'ref'

export type ProjectPlanningNodeKind = 'module' | 'page' | 'sub-page'
export type ProjectPagePlanningNodeKind = 'page' | 'sub-page'
export type ProjectPlanningParentKind = 'project' | ProjectPlanningNodeKind

export type ProjectRequirementConstraint = {
  nodeId: string
  title: string
  nodeKind: string
  description: string
}

export type PageNodeLoadOptions = {
  forceReload?: boolean
}

export type PageNodeNavigationConfig = {
  draft: NavigationNodeDraft
  context: NavigationContextDraft
}

export type PageNodeRenderConfig = {
  pageId: string
  navigation: PageNodeNavigationConfig | null
  rule: SparkNode[]
  data: DataSet
  script: string | undefined
  css: string | undefined
}

export type PageNodeLike = Pick<ProjectConfigPageNodeModel, 'pageId' | 'isLoaded' | 'load' | 'toRenderConfig' | 'getHttpClient'>

export type ProjectPageNodeSummary = Record<string, unknown> & {
  pageId: string
  path: string
  title: string
  nodeId: string
  nodeKind: NavNodeKind
  description: string
  userRequirement: string
  requirementConstraints: ProjectRequirementConstraint[]
  effectiveUserRequirement: string
  icon?: string
}

export type ProjectNodeModelOptions = {
  node: NavNode
  pid: string | null
  requirementConstraints?: readonly ProjectRequirementConstraint[]
}

export type ProjectConfigPageNodeModelOptions = ProjectNodeModelOptions & {
  pageId?: string
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
  contentLoaderFactory: () => BasePageContentLoader
  navClient?: NavigationConfigClient | undefined
}

const PROJECT_NODE_DIRTY_PARTS = ['navigation'] as const
export type ProjectNodeDirtyPart = typeof PROJECT_NODE_DIRTY_PARTS[number]

const CONFIG_PAGE_CONTENT_PARTS = ['rule', 'dataSet', 'style', 'script'] as const
export type ConfigPageContentPart = typeof CONFIG_PAGE_CONTENT_PARTS[number]

const CONFIG_PAGE_DIRTY_PARTS = [...PROJECT_NODE_DIRTY_PARTS, ...CONFIG_PAGE_CONTENT_PARTS] as const
export type ProjectConfigPageDirtyPart = typeof CONFIG_PAGE_DIRTY_PARTS[number]

export abstract class ProjectNodeModel {
  readonly navigation = new NavigationDraftModel()

  protected _node: NavNode
  private _pid: string | null
  private _requirementConstraints: ProjectRequirementConstraint[]

  constructor(options: ProjectNodeModelOptions) {
    this._node = options.node
    this._pid = normalizePid(options.pid)
    this._requirementConstraints = [...(options.requirementConstraints ?? [])]
    this.navigation.loadFromNode(this._node)
  }

  abstract get family(): ProjectNodeFamily

  get node(): NavNode {
    return this._node
  }

  get pid(): string | null {
    return this._pid
  }

  get id(): string {
    return this._node.id
  }

  get title(): string {
    return this._node.title
  }

  get description(): string {
    return readProjectNodeRequirement(this._node)
  }

  get userRequirement(): string {
    return this.description
  }

  get effectiveUserRequirement(): string {
    return formatProjectRequirementConstraints(this._requirementConstraints)
  }

  get icon(): string | undefined {
    return this._node.icon
  }

  get path(): string | undefined {
    return this._node.path
  }

  get nodeKind(): NavNodeKind {
    return this._node.nodeKind ?? 'page'
  }

  get requirementConstraints(): ProjectRequirementConstraint[] {
    return [...this._requirementConstraints]
  }

  rebindNavigationNode(
    node: NavNode,
    pid: string | null,
    requirementConstraints: readonly ProjectRequirementConstraint[],
  ): void {
    this._node = node
    this._pid = normalizePid(pid)
    this._requirementConstraints = [...requirementConstraints]
    if (this.navigation.isDirty) {
      this.navigation.navNode = node
    } else {
      this.navigation.loadFromNode(node)
    }
  }

  toFlatRow(): ProjectNavigationFlatNode {
    return projectNavNodeToFlatRow(this._node, this._pid)
  }
}

export class ProjectModuleNodeModel extends ProjectNodeModel {
  get family(): ProjectNodeFamily {
    return 'module'
  }

  get isSystemModule(): boolean {
    return this.nodeKind === 'system-directory'
  }
}

export abstract class ProjectPageNodeModel extends ProjectNodeModel {
  abstract get pageNodeKind(): 'config' | 'vue' | 'action' | 'link' | 'ref'
}

export class ProjectConfigPageNodeModel extends ProjectPageNodeModel {
  readonly rule = new PageRuleModel()
  readonly dataSet = new PageDataSetModel()
  readonly style = new PageTextModel('style.css')
  readonly script = new PageTextModel('script.js')

  private readonly _pageId: string
  private readonly fileApi: PageNodeFileApi
  private readonly fileCache: PageNodeFileCache
  private readonly contentLoaderFactory: () => BasePageContentLoader
  private readonly navClient: NavigationConfigClient | undefined
  private readonly _listeners = new Set<() => void>()
  private _isLoaded = false

  constructor(options: ProjectConfigPageNodeModelOptions) {
    super(options)
    this._pageId = normalizeConfigPageId(options.pageId ?? resolvePageNodePageId(options.node))
    if (!this._pageId) {
      throw new Error('配置页面节点缺少 pageId')
    }
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory
    this.navClient = options.navClient
    this.wireSubModels()
  }

  get family(): ProjectNodeFamily {
    return 'config-page'
  }

  get pageNodeKind(): 'config' {
    return 'config'
  }

  get pageId(): string {
    return this._pageId
  }

  get resolvedPath(): string {
    return this.path ?? `/${this.pageId}`
  }

  get isLoaded(): boolean {
    return this._isLoaded
  }

  isDirty(): boolean {
    return CONFIG_PAGE_DIRTY_PARTS.some(part => this.isPartDirty(part))
  }

  dirtyParts(): ProjectConfigPageDirtyPart[] {
    return CONFIG_PAGE_DIRTY_PARTS.filter(part => this.isPartDirty(part))
  }

  async load(options: PageNodeLoadOptions = {}): Promise<void> {
    const forceReload = options.forceReload === true
    if (this._isLoaded && !forceReload) return
    const contentLoader = this.contentLoaderFactory()
    const tasks: Array<Promise<void>> = []
    if (forceReload || !this.rule.isDirty) tasks.push(this.rule.load(this.pageId, contentLoader, options))
    if (forceReload || !this.dataSet.isDirty) tasks.push(this.dataSet.load(this.pageId, contentLoader, options))
    if (forceReload || !this.style.isDirty) tasks.push(this.style.load(this.pageId, contentLoader, options))
    if (forceReload || !this.script.isDirty) tasks.push(this.script.load(this.pageId, contentLoader, options))
    await Promise.all(tasks)
    this._isLoaded = true
  }

  async save(): Promise<void> {
    const parts = this.dirtyParts()
    await Promise.all(parts.map(part => this.savePart(part)))
  }

  async loadFile(name: PageNodeFileName, options?: PageNodeLoadOptions): Promise<void> {
    const contentLoader = this.contentLoaderFactory()
    switch (name) {
      case 'rule.json': await this.rule.load(this.pageId, contentLoader, options); break
      case 'pagedata.json': await this.dataSet.load(this.pageId, contentLoader, options); break
      case 'script.js': await this.script.load(this.pageId, contentLoader, options); break
      case 'style.css': await this.style.load(this.pageId, contentLoader, options); break
    }
  }

  getFileText(name: PageNodeFileName): string {
    switch (name) {
      case 'rule.json': return this.rule.getText()
      case 'pagedata.json': return this.dataSet.getText()
      case 'script.js': return this.script.text
      case 'style.css': return this.style.text
    }
  }

  async saveFile(name: PageNodeFileName): Promise<void> {
    switch (name) {
      case 'rule.json': await this.rule.save(this.pageId, this.fileApi); break
      case 'pagedata.json': await this.dataSet.save(this.pageId, this.fileApi); break
      case 'script.js': await this.script.save(this.pageId, this.fileApi); break
      case 'style.css': await this.style.save(this.pageId, this.fileApi); break
    }
    this.clearFileCache(name)
  }

  async saveDirtyFiles(): Promise<void> {
    const tasks: Array<Promise<void>> = []
    if (this.rule.isDirty) tasks.push(this.saveFile('rule.json'))
    if (this.dataSet.isDirty) tasks.push(this.saveFile('pagedata.json'))
    if (this.script.isDirty) tasks.push(this.saveFile('script.js'))
    if (this.style.isDirty) tasks.push(this.saveFile('style.css'))
    await Promise.all(tasks)
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  getHttpClient(): HttpClientBase | undefined {
    return this.contentLoaderFactory().getHttpClient()
  }

  toRenderConfig(): PageNodeRenderConfig {
    if (!this._isLoaded) {
      throw new Error(`配置页面节点 ${this.pageId} 尚未加载完成`)
    }
    return {
      pageId: this.pageId,
      navigation: this.navigation.navNode === null ? null : this.navigation.toDraftInput(),
      rule: getSparkNodeChildren(this.rule.tree.root.children),
      data: this.dataSet.tool.dataSet,
      script: optionalText(this.script.text),
      css: optionalText(this.style.text),
    }
  }

  toSummary(): ProjectPageNodeSummary {
    const summary = {
      pageId: this.pageId,
      path: this.resolvedPath,
      title: this.title,
      nodeId: this.id,
      nodeKind: this.nodeKind,
      description: this.description,
      userRequirement: this.userRequirement,
      requirementConstraints: this.requirementConstraints,
      effectiveUserRequirement: this.effectiveUserRequirement,
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
    return summary
  }

  private clearFileCache(name?: PageNodeFileName): void {
    this.fileCache.clearPageCache(this.pageId, name)
  }

  private isPartDirty(part: ProjectConfigPageDirtyPart): boolean {
    switch (part) {
      case 'navigation': return this.navigation.isDirty
      case 'rule': return this.rule.isDirty
      case 'dataSet': return this.dataSet.isDirty
      case 'style': return this.style.isDirty
      case 'script': return this.script.isDirty
    }
  }

  private async savePart(part: ProjectConfigPageDirtyPart): Promise<void> {
    switch (part) {
      case 'navigation': {
        if (!this.navClient) {
          throw new Error('缺少 NavigationConfigClient，无法保存导航节点')
        }
        await this.navigation.save(this.navClient)
        break
      }
      case 'rule': await this.saveFile('rule.json'); break
      case 'dataSet': await this.saveFile('pagedata.json'); break
      case 'style': await this.saveFile('style.css'); break
      case 'script': await this.saveFile('script.js'); break
    }
  }

  private wireSubModels(): void {
    for (const model of [this.navigation, this.rule, this.dataSet, this.style, this.script]) {
      model.subscribe(() => this.notify())
    }
  }

  private notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }
}

export class ProjectVuePageNodeModel extends ProjectPageNodeModel {
  get family(): ProjectNodeFamily {
    return 'vue-page'
  }

  get pageNodeKind(): 'vue' {
    return 'vue'
  }

  get routePath(): string {
    return this.path ?? ''
  }
}

export class ProjectSystemActionNodeModel extends ProjectPageNodeModel {
  get family(): ProjectNodeFamily {
    return 'system-action'
  }

  get pageNodeKind(): 'action' {
    return 'action'
  }

  get actionKey(): string {
    return this.path ?? ''
  }
}

export class ProjectLinkNodeModel extends ProjectPageNodeModel {
  get family(): ProjectNodeFamily {
    return 'link'
  }

  get pageNodeKind(): 'link' {
    return 'link'
  }
}

export class ProjectRefNodeModel extends ProjectPageNodeModel {
  get family(): ProjectNodeFamily {
    return 'ref'
  }

  get pageNodeKind(): 'ref' {
    return 'ref'
  }
}

export type ProjectNavigationFlatNode = {
  id: string
  pid: string | null
  title: string
  description: string
  nodeKind: NavNodeKind
  path: string
  icon: string
  dividerAfter: boolean
  childPlacement: string
  linkTarget: string
  hidden: boolean
  disabled: boolean
  order: number
  refId: string
  permissionMode: string
  node: NavNode
}

export function createProjectNodeModel(
  options: ProjectConfigPageNodeModelOptions,
): ProjectNodeModel {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (isConfigNodeKind(nodeKind)) return new ProjectConfigPageNodeModel(options)
  if (nodeKind === 'system-page') return new ProjectVuePageNodeModel(options)
  if (nodeKind === 'system-action') return new ProjectSystemActionNodeModel(options)
  if (nodeKind === 'link') return new ProjectLinkNodeModel(options)
  if (nodeKind === 'ref') return new ProjectRefNodeModel(options)
  return new ProjectModuleNodeModel(options)
}

export function isProjectConfigPageNodeModel(node: ProjectNodeModel | null | undefined): node is ProjectConfigPageNodeModel {
  return node instanceof ProjectConfigPageNodeModel
}

export function isProjectModuleNodeModel(node: ProjectNodeModel | null | undefined): node is ProjectModuleNodeModel {
  return node instanceof ProjectModuleNodeModel
}

export function isProjectPageNodeModel(node: ProjectNodeModel | null | undefined): node is ProjectPageNodeModel {
  return node instanceof ProjectPageNodeModel
}

export function isConfigNodeKind(kind: string | undefined | null): boolean {
  const normalized = kind ?? 'page'
  return normalized === 'page' || normalized === 'sub-page'
}

export function isProjectPageNodeKind(kind: string | undefined | null): kind is ProjectPagePlanningNodeKind {
  return kind === 'page' || kind === 'sub-page'
}

export function isProjectModuleNodeKind(kind: string | undefined | null): boolean {
  return kind === 'module' || kind === 'system-directory'
}

export function readProjectPlanningNodeKind(node: NavNode | null | undefined): ProjectPlanningNodeKind | null {
  const kind = node?.nodeKind ?? 'page'
  if (kind === 'module' || kind === 'system-directory') return 'module'
  if (kind === 'page') return 'page'
  if (kind === 'sub-page') return 'sub-page'
  return null
}

export function canProjectNodeContainChild(
  parentKind: ProjectPlanningParentKind,
  childKind: ProjectPlanningNodeKind,
): boolean {
  if (parentKind === 'project' || parentKind === 'module') {
    return childKind === 'module' || childKind === 'page'
  }
  return childKind === 'sub-page'
}

export function readAllowedProjectPlanningChildKinds(
  parentKind: ProjectPlanningParentKind,
): readonly ProjectPlanningNodeKind[] {
  if (parentKind === 'project' || parentKind === 'module') {
    return ['module', 'page']
  }
  return ['sub-page']
}

export function normalizeConfigPageId(value: string | undefined | null): string {
  return (value ?? '').trim()
}

export function resolvePageIdFromProjectPath(path: string | undefined | null): string {
  return normalizePageIdFromPath(path)
}

export function resolvePageNodePageId(node: NavNode | null | undefined): string {
  if (!node || !isConfigNodeKind(node.nodeKind ?? 'page')) return ''
  const pageIdFromPath = resolvePageIdFromProjectPath(node.path)
  if (pageIdFromPath) return pageIdFromPath
  return node.id.trim()
}

export function readProjectNodeRequirement(node: NavNode | null | undefined): string {
  return node?.description?.trim() ?? ''
}

export function createProjectRequirementConstraint(
  node: NavNode | null | undefined,
): ProjectRequirementConstraint | null {
  const description = readProjectNodeRequirement(node)
  if (!node || !description) return null
  return {
    nodeId: node.id,
    title: node.title,
    nodeKind: node.nodeKind ?? 'page',
    description,
  }
}

export function appendProjectRequirementConstraint(
  constraints: readonly ProjectRequirementConstraint[],
  node: NavNode | null | undefined,
): ProjectRequirementConstraint[] {
  const next = createProjectRequirementConstraint(node)
  return next === null ? [...constraints] : [...constraints, next]
}

export function formatProjectRequirementConstraints(
  constraints: readonly ProjectRequirementConstraint[],
): string {
  return constraints.map(item => `${item.title}: ${item.description}`).join('\n')
}

export function flattenProjectNavigationRoot(root: AppNavRoot): Array<{ node: NavNode; pid: string | null }> {
  const normalizedRoot = normalizeNavRoot(root)
  const result: Array<{ node: NavNode; pid: string | null }> = []
  const visit = (nodes: readonly NavNode[], pid: string | null): void => {
    for (const node of nodes) {
      result.push({ node, pid })
      visit(Array.isArray(node.children) ? node.children : [], node.id)
      delete node.children
    }
  }
  visit(normalizedRoot.children, null)
  return result
}

export function buildProjectNavigationTree(nodes: readonly ProjectNodeModel[]): NavNode[] {
  const byParent = new Map<string, NavNode[]>()
  for (const model of nodes) {
    const parentKey = model.pid ?? ''
    const cloned = cloneNavNodeWithoutChildren(model.node)
    const siblings = byParent.get(parentKey) ?? []
    siblings.push(cloned)
    byParent.set(parentKey, siblings)
  }
  for (const model of [...nodes].sort((a, b) => b.id.length - a.id.length)) {
    const children = byParent.get(model.id) ?? []
    if (children.length > 0) {
      const projected = findProjectedNode(byParent.get(model.pid ?? '') ?? [], model.id)
      if (projected) projected.children = sortNavNodes(children)
    }
  }
  return sortNavNodes(byParent.get('') ?? [])
}

export function projectNavNodeToFlatRow(node: NavNode, pid: string | null): ProjectNavigationFlatNode {
  return {
    id: node.id,
    pid: normalizePid(pid),
    title: node.title,
    description: node.description ?? '',
    nodeKind: node.nodeKind ?? 'page',
    path: node.path ?? '',
    icon: node.icon ?? '',
    dividerAfter: node.dividerAfter === true,
    childPlacement: node.childPlacement ?? '',
    linkTarget: node.linkTarget ?? '',
    hidden: node.hidden === true,
    disabled: node.disabled === true,
    order: typeof node.order === 'number' ? node.order : 0,
    refId: node.refId ?? '',
    permissionMode: node.permissionMode ?? '',
    node,
  }
}

function normalizePid(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized ? normalized : null
}

function cloneNavNodeWithoutChildren(node: NavNode): NavNode {
  const cloned: NavNode = { ...node }
  delete cloned.children
  return cloned
}

function sortNavNodes(nodes: NavNode[]): NavNode[] {
  return nodes.sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : 0
    const orderB = typeof b.order === 'number' ? b.order : 0
    if (orderA !== orderB) return orderA - orderB
    return a.id.localeCompare(b.id)
  })
}

function findProjectedNode(nodes: readonly NavNode[], id: string): NavNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findProjectedNode(node.children ?? [], id)
    if (found !== null) return found
  }
  return null
}

function optionalText(value: string): string | undefined {
  return value.trim() === '' ? undefined : value
}
