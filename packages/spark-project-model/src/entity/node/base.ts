/** 节点基类——ProjectNode + PageNode。 */
import type { NavNode, NavNodeKind } from '../../service/navigation/nav-model'
import { NavDraft } from './navigation-draft-model'
import type { ProjectNodeFamily, ProjectRequirementConstraint } from '../../contract/node'
import type { PageNodeFileApi } from '../../service/file/page-file-api'
import type { PageNodeFileCache } from '../../service/file/page-file-cache'
import type { BasePageContentLoader } from '../../service/loader/page-content-types'
import type { NavigationConfigClient } from '../../service/navigation/client'
import { normalizePid, readProjectNodeRequirement, formatProjectRequirementConstraints, projectNavNodeToFlatRow } from './helpers'
import type { ProjectNavigationFlatNode } from './helpers'

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

export abstract class ProjectNode {
  readonly navigation = new NavDraft()
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

  get node(): NavNode { return this._node }
  get pid(): string | null { return this._pid }
  get id(): string { return this._node.id }
  get title(): string { return this._node.title }
  get description(): string { return readProjectNodeRequirement(this._node) }
  get userRequirement(): string { return this.description }
  get effectiveUserRequirement(): string { return formatProjectRequirementConstraints(this._requirementConstraints) }
  get icon(): string | undefined { return this._node.icon }
  get path(): string | undefined { return this._node.path }
  get nodeKind(): NavNodeKind { return this._node.nodeKind ?? 'page' }
  get requirementConstraints(): ProjectRequirementConstraint[] { return [...this._requirementConstraints] }

  rebindNavigationNode(node: NavNode, pid: string | null, requirementConstraints: readonly ProjectRequirementConstraint[]): void {
    this._node = node
    this._pid = normalizePid(pid)
    this._requirementConstraints = [...requirementConstraints]
    if (this.navigation.isDirty) { this.navigation.navNode = node }
    else { this.navigation.loadFromNode(node) }
  }

  toFlatRow(): ProjectNavigationFlatNode { return projectNavNodeToFlatRow(this._node, this._pid) }
}

export abstract class PageNode extends ProjectNode {
  abstract get pageNodeKind(): 'config' | 'vue' | 'action' | 'link' | 'ref'
}
