/**
 * 项目导航节点基 class。
 *
 * 按 nodeKind 选择 ConfigPageNode 等子类；ProjectNodeData 仅为序列化形状。
 */
import { deepClone, isRecord } from '@spark-appworks/spark-utils'
import { normalizePid, readProjectNodeDescription, formatProjectDescriptionContext } from './helpers'

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

export type ProjectNodeFamily = 'module' | 'config-page' | 'system-page' | 'system-action' | 'link' | 'ref'

export type ProjectDescriptionContext = {
  nodeId: string
  title: string
  nodeKind: string
  description: string
}

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

export type ProjectNodeNavigationPatch = {
  title: string
  nodeKind?: NavNodeKind | undefined
  icon?: string | undefined
  dividerAfter?: boolean | undefined
  description?: string | undefined
  path?: string | undefined
  linkTarget?: string | undefined
  childPlacement?: string | undefined
  order?: number | undefined
  hidden?: boolean | undefined
  disabled?: boolean | undefined
  refId?: string | undefined
  permissionMode?: NavPermissionMode | undefined
  context?: string | NavContextItem[] | NavContextConfig | undefined
}

export type ProjectNodeLocation = {
  node: ProjectNodeData
  parent: ProjectNodeData | null
  parentId: string | null
  index: number
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

/** 导航页在模型侧的页面表面（不携带应用框架实现细节）。 */
export type ProjectPageSurface =
  | 'config-files'
  | 'system-page'
  | 'link'
  | 'ref'
  | 'none'

export type ProjectPageNodeSummary = Record<string, unknown> & {
  pageId: string
  path: string
  title: string
  nodeId: string
  nodeKind: NavNodeKind
  /** 模型侧编辑表面：config-files=四文件；system-page=系统页；none=不可编辑页面文件 */
  designSurface: ProjectPageSurface
  description: string
  descriptionContext: ProjectDescriptionContext[]
  effectiveDescription: string
  icon?: string
}

export type ProjectNodeModelOptions = {
  node: ProjectNodeData
  pid: string
  descriptionContext?: readonly ProjectDescriptionContext[]
}

function cloneProjectNodeData(node: ProjectNodeData): ProjectNodeData {
  const cloned = deepClone(node)
  delete cloned.children
  return cloned
}

export class ProjectNode {
  #node: ProjectNodeData
  #pid: string
  #descriptionContext: ProjectDescriptionContext[]

  constructor(options: ProjectNodeModelOptions) {
    this.#node = cloneProjectNodeData(options.node)
    this.#pid = normalizePid(options.pid)
    this.#descriptionContext = [...(options.descriptionContext ?? [])]
  }

  get family(): ProjectNodeFamily {
    if (this.nodeKind === 'system-page') return 'system-page'
    if (this.nodeKind === 'system-action') return 'system-action'
    if (this.nodeKind === 'link') return 'link'
    if (this.nodeKind === 'ref') return 'ref'
    return 'module'
  }
  toNodeData(): ProjectNodeData { return cloneProjectNodeData(this.#node) }

  /** 导航编辑只能通过 class API 提交；DTO 快照不可作为包内可变真源。 */
  applyNavigationPatch(patch: ProjectNodeNavigationPatch): void {
    const next = cloneProjectNodeData(this.#node)
    if (!('icon' in patch)) delete next.icon
    if (!('description' in patch)) delete next.description
    if (!('path' in patch)) delete next.path
    if (!('linkTarget' in patch)) delete next.linkTarget
    if (!('childPlacement' in patch)) delete next.childPlacement
    if (!('hidden' in patch)) delete next.hidden
    if (!('disabled' in patch)) delete next.disabled
    if (!('context' in patch)) delete next.context
    if (!('dividerAfter' in patch)) delete next.dividerAfter
    if (!('nodeKind' in patch)) delete next.nodeKind
    if (!('refId' in patch)) delete next.refId
    if (!('permissionMode' in patch)) delete next.permissionMode

    Object.assign(next, deepClone(patch))

    if (!next.icon) delete next.icon
    if (!next.description) delete next.description
    if (!next.path) delete next.path
    if (next.nodeKind !== 'link' || !next.linkTarget) delete next.linkTarget
    if (!next.childPlacement) delete next.childPlacement
    if (!next.hidden) delete next.hidden
    if (!next.disabled) delete next.disabled
    if (next.context === undefined || next.context === '') delete next.context
    if (!next.dividerAfter) delete next.dividerAfter
    if (next.nodeKind !== 'ref' || !next.refId) delete next.refId
    this.#node = next
  }

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
  rebindNavigationNode(node: ProjectNodeData, pid: string, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this.#node = cloneProjectNodeData(node)
    this.#pid = normalizePid(pid)
    this.#descriptionContext = [...descriptionContext]
  }
}
