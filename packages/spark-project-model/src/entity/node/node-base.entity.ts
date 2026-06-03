/** 项目节点基类。 */
import { isRecord } from '@spark-view/spark-utils'
import { NavigationEditModel } from '../navigation/edit.entity'
import type { ProjectNodeFamily, ProjectDescriptionContext } from './module-node.entity'
import { normalizePid, readProjectNodeDescription, formatProjectDescriptionContext } from './node-helpers'

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
  linkTarget?: 'iframe' | 'new-tab' | 'self' | undefined
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
export type ProjectModelData = Omit<ProjectNodeData, 'id' | 'nodeKind' | 'children' | 'childPlacement'> & {
  id?: string | undefined
  nodeKind?: 'module' | 'system-directory' | undefined
  title: string
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
  pid: string
  descriptionContext?: readonly ProjectDescriptionContext[]
}

export abstract class ProjectNode {
  readonly navigation = new NavigationEditModel()
  #node: ProjectNodeData
  #pid: string
  #descriptionContext: ProjectDescriptionContext[]

  constructor(options: ProjectNodeModelOptions) {
    this.#node = options.node
    this.#pid = normalizePid(options.pid)
    this.#descriptionContext = [...(options.descriptionContext ?? [])]
    this.navigation.loadFromNode(this.#node)
  }

  abstract get family(): ProjectNodeFamily

  /** @vcmIgnore */
  toNodeData(): ProjectNodeData { return this.#node }

  /**
   * 父节点 ID；根级节点为 ''。
   */
  get pid(): string { return this.#pid }

  /**
   * 节点 ID。
   */
  get id(): string { return this.#node.id }

  /**
   * 节点名称。
   */
  get name(): string { return this.#node.title }

  get title(): string { return this.#node.title }
  get version(): string | undefined { return this.#node.version }
  get nodeKind(): NavNodeKind { return this.#node.nodeKind ?? 'page' }
  get path(): string | undefined { return this.#node.path }
  get icon(): string | undefined { return this.#node.icon }
  get dividerAfter(): boolean { return this.#node.dividerAfter === true }
  get childPlacement(): ChildPlacement | undefined { return this.#node.childPlacement }
  get linkTarget(): ProjectNodeData['linkTarget'] | undefined { return this.#node.linkTarget }
  get hidden(): boolean { return this.#node.hidden === true }
  get disabled(): boolean { return this.#node.disabled === true }
  get order(): number { return typeof this.#node.order === 'number' ? this.#node.order : 0 }
  get refId(): string | undefined { return this.#node.refId }
  get refPath(): string | undefined { return this.#node.refPath }
  get refProjectId(): string | undefined { return this.#node.refProjectId }
  get refBroken(): boolean | undefined { return this.#node.refBroken }
  get context(): ProjectNodeData['context'] { return this.#node.context }
  get permissionMode(): NavPermissionMode | undefined { return this.#node.permissionMode }

  /**
   * 节点描述。
   */
  get description(): string { return readProjectNodeDescription(this.#node) }

  protected get effectiveDescription(): string { return formatProjectDescriptionContext(this.#descriptionContext) }
  protected get descriptionContext(): ProjectDescriptionContext[] { return [...this.#descriptionContext] }

  /** @vcmIgnore */
  rebindNavigationNode(node: ProjectNodeData, pid: string, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this.#node = node
    this.#pid = normalizePid(pid)
    this.#descriptionContext = [...descriptionContext]
    if (this.navigation.isDirty) { this.navigation.navNode = node }
    else { this.navigation.loadFromNode(node) }
  }
}
