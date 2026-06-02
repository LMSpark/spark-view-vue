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

export type ProjectNodeAttributes = Omit<NavNode, 'id' | 'title' | 'description' | 'children'>

export type ProjectNodeModelOptions = {
  node: NavNode
  pid: string | null
  descriptionContext?: readonly ProjectDescriptionContext[]
  resolveChildren?: ((node: ProjectNode) => readonly ProjectNode[]) | undefined
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
  #node: NavNode
  #pid: string | null
  #descriptionContext: ProjectDescriptionContext[]
  #resolveChildren: ((node: ProjectNode) => readonly ProjectNode[]) | undefined

  constructor(options: ProjectNodeModelOptions) {
    this.#node = options.node
    this.#pid = normalizePid(options.pid)
    this.#descriptionContext = [...(options.descriptionContext ?? [])]
    this.#resolveChildren = options.resolveChildren
    this.navigation.loadFromNode(this.#node)
  }

  abstract get family(): ProjectNodeFamily

  /**
   * 节点领域类型。
   */
  get type(): ProjectNodeFamily { return this.family }

  /**
   * 原始导航节点快照。
   */
  get node(): NavNode { return this.#node }

  /**
   * 父节点 ID；根级节点为 null。
   */
  get pid(): string | null { return this.#pid }

  /**
   * 节点 ID。
   */
  get id(): string { return this.#node.id }

  /**
   * 节点名称。
   */
  get name(): string { return this.#node.title }

  /**
   * 节点描述。
   */
  get description(): string { return readProjectNodeDescription(this.#node) }

  /**
   * 节点自由属性，不包含 id、name、description 和 children。
   */
  get attributes(): ProjectNodeAttributes {
    const { id: _id, title: _title, description: _description, children: _children, ...attributes } = this.#node
    return { ...attributes }
  }

  /**
   * 当前节点的直接子节点。
   */
  get children(): ProjectNode[] { return [...(this.#resolveChildren?.(this) ?? [])] }

  /**
   * @deprecated use name
   */
  get title(): string { return this.name }

  get effectiveDescription(): string { return formatProjectDescriptionContext(this.#descriptionContext) }
  get icon(): string | undefined { return this.#node.icon }
  get path(): string | undefined { return this.#node.path }
  get nodeKind(): NavNodeKind { return this.#node.nodeKind ?? 'page' }
  get descriptionContext(): ProjectDescriptionContext[] { return [...this.#descriptionContext] }

  rebindNavigationNode(node: NavNode, pid: string | null, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this.#node = node
    this.#pid = normalizePid(pid)
    this.#descriptionContext = [...descriptionContext]
    if (this.navigation.isDirty) { this.navigation.navNode = node }
    else { this.navigation.loadFromNode(node) }
  }

  toFlatRow(): ProjectNavigationFlatNode { return projectNavNodeToFlatRow(this.#node, this.#pid) }
}

export abstract class PageNode extends ProjectNode {
  abstract get pageNodeKind(): 'config' | 'vue' | 'action' | 'link' | 'ref'
}
