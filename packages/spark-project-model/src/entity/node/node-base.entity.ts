/** 节点基类——ProjectNode + PageNode。 */
import type { NavNode, NavNodeKind } from '../../service/navigation/nav-model'
import { NavigationEditModel } from '../navigation/edit.entity'
import type { ProjectNodeFamily, ProjectDescriptionContext } from '../../contract/node.contract'
import type { PageNodeFileApi } from '../../service/file/file-api.service'
import type { PageNodeFileCache } from '../../service/file/file-cache.service'
import type { BasePageContentLoader } from '../../service/content-loader/types'
import type { NavigationConfigClient } from '../../service/navigation/client.service'
import { normalizePid, readProjectNodeDescription, formatProjectDescriptionContext, projectNavNodeToFlatRow } from './node-helpers'
import type { ProjectNavigationFlatNode } from './node-helpers'

export type ProjectNodeModelOptions = {
  node: NavNode
  pid: string | null
  descriptionContext?: readonly ProjectDescriptionContext[]
}

export type ProjectConfigPageNodeModelOptions = ProjectNodeModelOptions & {
  pageId?: string
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
  contentLoaderFactory: () => BasePageContentLoader
  navClient?: NavigationConfigClient | undefined
}

export type ProjectNodeDirtyPart = 'navigation'

export type ConfigPageContentPart = 'rule' | 'dataSet' | 'style' | 'script'

export type ProjectConfigPageDirtyPart = ProjectNodeDirtyPart | ConfigPageContentPart

export abstract class ProjectNode {
  readonly navigation = new NavigationEditModel()
  protected _node: NavNode
  private _pid: string | null
  private _descriptionContext: ProjectDescriptionContext[]

  constructor(options: ProjectNodeModelOptions) {
    this._node = options.node
    this._pid = normalizePid(options.pid)
    this._descriptionContext = [...(options.descriptionContext ?? [])]
    this.navigation.loadFromNode(this._node)
  }

  abstract get family(): ProjectNodeFamily

  get node(): NavNode { return this._node }
  get pid(): string | null { return this._pid }
  get id(): string { return this._node.id }
  get title(): string { return this._node.title }
  get description(): string { return readProjectNodeDescription(this._node) }
  get effectiveDescription(): string { return formatProjectDescriptionContext(this._descriptionContext) }
  get icon(): string | undefined { return this._node.icon }
  get path(): string | undefined { return this._node.path }
  get nodeKind(): NavNodeKind { return this._node.nodeKind ?? 'page' }
  get descriptionContext(): ProjectDescriptionContext[] { return [...this._descriptionContext] }

  rebindNavigationNode(node: NavNode, pid: string | null, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this._node = node
    this._pid = normalizePid(pid)
    this._descriptionContext = [...descriptionContext]
    if (this.navigation.isDirty) { this.navigation.navNode = node }
    else { this.navigation.loadFromNode(node) }
  }

  toFlatRow(): ProjectNavigationFlatNode { return projectNavNodeToFlatRow(this._node, this._pid) }
}

export abstract class PageNode extends ProjectNode {
  abstract get pageNodeKind(): 'config' | 'vue' | 'action' | 'link' | 'ref'
}
