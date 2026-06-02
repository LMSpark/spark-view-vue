/** 节点基类——ProjectNode + PageNode。 */
import { isRecord } from '@spark-view/spark-utils'
import { NavigationEditModel } from '../navigation/edit.entity'
import type { LinkTarget } from './leaf-nodes.entity'
import type { ProjectNodeFamily, ProjectDescriptionContext } from './module-node.entity'
import { normalizePid, readProjectNodeDescription, formatProjectDescriptionContext, projectNavNodeToFlatRow } from './node-helpers'
import type { ProjectNavigationFlatNode } from './node-helpers'

/** 子节点布局位置：决定子节点在 UI 中的渲染区域。 */
export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

/** 项目节点类型。 */
export type NavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'system-action'
  | 'page'
  | 'link'
  | 'sub-page'
  | 'ref'

/** 权限未匹配时的展示模式。 */
export type NavPermissionMode = 'none' | 'masked' | 'invisible'

/** 上下文下拉选项项。 */
export type NavContextItem = {
  id: string | number
  title: string
}

/** 动态上下文配置：描述 ProjectNode 上下文的来源和交互行为。 */
export type NavContextConfig = {
  source: string | NavContextItem[]
  placeholder?: string | undefined
  defaultValue?: string | number | undefined
  paramName?: string | undefined
}

/** 项目树节点的可序列化数据形状。 */
export type ProjectNodeData = {
  id: string
  title: string
  description?: string | undefined
  version?: string | undefined
  icon?: string | undefined
  nodeKind?: NavNodeKind | undefined
  childPlacement?: ChildPlacement | undefined
  context?: string | NavContextItem[] | NavContextConfig | undefined
  order?: number | undefined
  hidden?: boolean | undefined
  disabled?: boolean | undefined
  dividerAfter?: boolean | undefined
  permissionMode?: NavPermissionMode | undefined
  children?: ProjectNodeData[] | undefined
  path?: string | undefined
  linkTarget?: LinkTarget | undefined
  redirect?: string | undefined
  refId?: string | undefined
  refPath?: string | undefined
  refProjectId?: string | undefined
  refBroken?: boolean | undefined
}

export function isProjectNodeData(value: unknown): value is ProjectNodeData {
  if (!isRecord(value)) return false
  if (typeof value['id'] !== 'string') return false
  if (typeof value['title'] !== 'string') return false
  const children = value['children']
  return children === undefined || (Array.isArray(children) && children.every(isProjectNodeData))
}

/** 项目模型的可序列化根数据。 */
export type ProjectModelData = {
  id?: string | undefined
  title: string
  description?: string | undefined
  version?: string | undefined
  childPlacement: 'header' | 'sidebar'
  children: ProjectNodeData[]
  homePath?: string | undefined
}

/** 按区域分组的导航节点列表。 */
export type RegionItems = {
  header: ProjectNodeData[]
  sidebar: ProjectNodeData[]
  toolbar: ProjectNodeData[]
  userMenu: ProjectNodeData[]
}

/** 各区域是否可见。 */
export type RegionVisibility = {
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}

/** 导航上下文运行时状态。 */
export type NavContextState = {
  config: NavContextConfig
  nodeId: string
  selected: string | number | null
  items: NavContextItem[]
  loading: boolean
  error: string | null
}

export type ProjectNodeModelOptions = {
  node: ProjectNodeData
  pid: string | null
  descriptionContext?: readonly ProjectDescriptionContext[]
  resolveChildren?: ((node: ProjectNode) => readonly ProjectNode[]) | undefined
}

export abstract class ProjectNode {
  readonly navigation = new NavigationEditModel()
  #node: ProjectNodeData
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
   * 原始导航节点快照。
   */
  get node(): ProjectNodeData { return this.#node }

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
   * @deprecated use name
   */
  get title(): string { return this.name }

  get effectiveDescription(): string { return formatProjectDescriptionContext(this.#descriptionContext) }
  get descriptionContext(): ProjectDescriptionContext[] { return [...this.#descriptionContext] }

  protected readChildren<TChild extends ProjectNode = ProjectNode>(): TChild[] {
    return [...(this.#resolveChildren?.(this) ?? [])] as TChild[]
  }

  protected bindChildrenResolver(resolveChildren: (node: ProjectNode) => readonly ProjectNode[]): void {
    this.#resolveChildren = resolveChildren
  }

  rebindNavigationNode(node: ProjectNodeData, pid: string | null, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this.#node = node
    this.#pid = normalizePid(pid)
    this.#descriptionContext = [...descriptionContext]
    if (this.navigation.isDirty) { this.navigation.navNode = node }
    else { this.navigation.loadFromNode(node) }
  }

  toFlatRow(): ProjectNavigationFlatNode { return projectNavNodeToFlatRow(this.#node, this.#pid) }
}
