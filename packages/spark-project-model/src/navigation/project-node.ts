/**
 * @module @spark-appworks/spark-project-model:navigation/project-node
 * 职责：提供项目模型层 project-node 能力，围绕 ChildPlacement、NavNodeKind、NavPermissionMode 等 18 个公开契约 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 navigation/project-node。
 */
/**
 * 项目导航节点基 class。
 *
 * 按 nodeKind 选择 ConfigPageNode 等子类；ProjectNodeData 仅为序列化形状。
 */
import { deepClone, isRecord } from '@spark-appworks/spark-utils'

export function normalizePid(v: string | null | undefined): string { return v?.trim() ?? '' }

export function readProjectNodeDescription(node: ProjectNodeData | null | undefined): string {
  return node?.description?.trim() ?? ''
}

export function formatProjectDescriptionContext(context: readonly ProjectDescriptionContext[]): string {
  return context.map(item => `${item.title}: ${item.description}`).join('\n')
}

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
  | 'ref'

/** 权限未匹配时的展示模式。 */
export type NavPermissionMode = 'none' | 'masked' | 'invisible'

/** Project Node Family 的语义模型。 */
export type ProjectNodeFamily = 'module' | 'config-page' | 'system-page' | 'system-action' | 'link' | 'ref'

/** Project Description Context 的运行上下文。 */
export type ProjectDescriptionContext = {
  /** 上下文来源节点 ID。 */
  nodeId: string
  /** 上下文来源节点标题。 */
  title: string
  /** 上下文来源节点类型。 */
  nodeKind: string
  /** 上下文来源节点描述文本。 */
  description: string
}

/** 上下文下拉选项项。 */
export type NavContextItem = {
  /** 选项稳定值，会写入导航上下文状态。 */
  id: string | number
  /** 选项展示标题。 */
  title: string
}

/** 动态上下文配置：描述 ProjectNode 上下文的来源和交互行为。 */
export type NavContextConfig = {
  /** 上下文选项来源；字符串表示远端/命名来源，数组表示内联静态选项。 */
  source: string | NavContextItem[]
  /** 上下文未选择时的占位提示。 */
  placeholder?: string | undefined
  /** 上下文默认选中值。 */
  defaultValue?: string | number | undefined
  /** 写入路由或查询参数时使用的参数名。 */
  paramName?: string | undefined
}

/** 项目树节点的可序列化数据形状。 */
export type ProjectNodeData = {
  /** 导航节点唯一 ID。 */
  id: string
  /** 导航节点标题。 */
  title: string
  /** 节点业务描述，供 AI 策划和页面设计理解用途。 */
  description?: string | undefined
  /** 节点策划详细说明附件引用；正文由工作区解析后传给 LLM。 */
  planningAttachmentRef?: string | undefined
  /** 节点版本号或版本标签。 */
  version?: string | undefined
  /** 节点图标名。 */
  icon?: string | undefined
  /** 导航节点类型，决定页面、模块、链接、引用等行为。 */
  nodeKind?: NavNodeKind | undefined
  /** 子节点在应用壳中的布局区域。 */
  childPlacement?: ChildPlacement | undefined
  /** 导航上下文配置或静态上下文选项。 */
  context?: string | NavContextItem[] | NavContextConfig | undefined
  /** 同级排序值，数值越小越靠前。 */
  order?: number | undefined
  /** 是否在导航中隐藏。 */
  hidden?: boolean | undefined
  /** 是否禁用该导航节点。 */
  disabled?: boolean | undefined
  /** 是否在该节点后显示分隔线。 */
  dividerAfter?: boolean | undefined
  /** 权限不匹配时的展示策略。 */
  permissionMode?: NavPermissionMode | undefined
  /** 子导航节点。 */
  children?: ProjectNodeData[] | undefined
  /** 页面路由路径。 */
  path?: string | undefined
  /** link 节点的打开目标。 */
  linkTarget?: 'iframe' | 'new-tab' | 'self' | undefined
  /** 重定向目标路径。 */
  redirect?: string | undefined
  /** ref 节点引用的目标节点 ID。 */
  refId?: string | undefined
  /** ref 节点解析后的目标路径。 */
  refPath?: string | undefined
  /** ref 节点引用的目标项目 ID。 */
  refProjectId?: string | undefined
  /** ref 引用是否已失效。 */
  refBroken?: boolean | undefined
  /** pageDesign 实现放行闸门；缺省过渡期为 open。 */
  implGate?: 'closed' | 'open' | undefined
  /** 上游 iPaaS / 契约就绪；缺省 true。 */
  upstreamContractsSatisfied?: boolean | undefined
}

/** Project Node Navigation Patch 的语义模型。 */
export type ProjectNodeNavigationPatch = {
  /** 新标题。 */
  title: string
  /** 新节点类型。 */
  nodeKind?: NavNodeKind | undefined
  /** 新图标名。 */
  icon?: string | undefined
  /** 是否在节点后显示分隔线。 */
  dividerAfter?: boolean | undefined
  /** 新节点描述。 */
  description?: string | undefined
  /** 新策划详细说明附件引用。 */
  planningAttachmentRef?: string | undefined
  /** 新路由路径。 */
  path?: string | undefined
  /** link 节点新打开目标。 */
  linkTarget?: string | undefined
  /** 新子节点布局区域。 */
  childPlacement?: string | undefined
  /** 新同级排序值。 */
  order?: number | undefined
  /** 是否隐藏节点。 */
  hidden?: boolean | undefined
  /** 是否禁用节点。 */
  disabled?: boolean | undefined
  /** 新 ref 目标节点 ID。 */
  refId?: string | undefined
  /** 新权限展示策略。 */
  permissionMode?: NavPermissionMode | undefined
  /** 新导航上下文配置。 */
  context?: string | NavContextItem[] | NavContextConfig | undefined
  /** 新 pageDesign 实现放行闸门。 */
  implGate?: 'closed' | 'open' | undefined
  /** 新上游契约就绪状态。 */
  upstreamContractsSatisfied?: boolean | undefined
}

/** Project Node Location 的语义模型。 */
export type ProjectNodeLocation = {
  /** 命中的节点数据。 */
  node: ProjectNodeData
  /** 父节点数据；根节点无父级时为 null。 */
  parent: ProjectNodeData | null
  /** 父节点 ID；根节点无父级时为 null。 */
  parentId: string | null
  /** 节点在父级 children 中的索引。 */
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
  /** 项目根节点 ID。 */
  id?: string | undefined
  /** 项目根节点类型。 */
  nodeKind?: 'module' | 'system-directory' | undefined
  /** 项目标题。 */
  title: string
  /** 项目根节点子级布局区域。 */
  childPlacement: 'header' | 'sidebar'
  /** 项目导航树根级子节点。 */
  children: ProjectNodeData[]
  /** 项目首页路径。 */
  homePath?: string | undefined
}

/** 按区域分组的导航节点列表。 */
export type RegionItems = {
  /** 顶部导航区域节点。 */
  header: ProjectNodeData[]
  /** 侧边栏区域节点。 */
  sidebar: ProjectNodeData[]
  /** 工具栏区域节点。 */
  toolbar: ProjectNodeData[]
  /** 用户菜单区域节点。 */
  userMenu: ProjectNodeData[]
}

/** 各区域是否可见。 */
export type RegionVisibility = {
  /** 顶部导航是否可见。 */
  header: boolean
  /** 侧边栏是否可见。 */
  sidebar: boolean
  /** 工具栏是否可见。 */
  toolbar: boolean
  /** 用户菜单是否可见。 */
  userMenu: boolean
}

/** 导航上下文运行时状态。 */
export type NavContextState = {
  /** 当前上下文配置。 */
  config: NavContextConfig
  /** 绑定该上下文的导航节点 ID。 */
  nodeId: string
  /** 当前选中上下文值。 */
  selected: string | number | null
  /** 当前可选上下文项。 */
  items: NavContextItem[]
  /** 上下文选项是否正在加载。 */
  loading: boolean
  /** 上下文加载错误消息。 */
  error: string | null
}

/** 导航页在模型侧的页面表面（不携带应用框架实现细节）。 */
export type ProjectPageSurface =
  | 'config-files'
  | 'system-page'
  | 'link'
  | 'ref'
  | 'none'

/** Project Page Node Summary 的语义模型。 */
export type ProjectPageNodeSummary = Record<string, unknown> & {
  /** 配置页 pageId。 */
  pageId: string
  /** 页面路由路径。 */
  path: string
  /** 页面标题。 */
  title: string
  /** 导航节点 ID。 */
  nodeId: string
  /** 导航节点类型。 */
  nodeKind: NavNodeKind
  /** 模型侧编辑表面：config-files=四文件；system-page=系统页；none=不可编辑页面文件 */
  designSurface: ProjectPageSurface
  /** 页面节点自身描述。 */
  description: string
  /** 页面节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 从祖先或上下文节点继承的描述列表。 */
  descriptionContext: ProjectDescriptionContext[]
  /** 聚合后的有效描述文本，供 AI 理解页面意图。 */
  effectiveDescription: string
  /** 实现放行闸门；缺省过渡期为 open（runner 可 strictImplGate）。 */
  implGate?: 'closed' | 'open'
  /** 上游 iPaaS / 契约就绪；缺省 true。 */
  upstreamContractsSatisfied?: boolean
  /** 页面图标名。 */
  icon?: string
}

/** Project Node Model Options 的调用配置。 */
export type ProjectNodeModelOptions = {
  /** 当前导航节点数据快照。 */
  node: ProjectNodeData
  /** 父节点 ID；根级节点传空字符串。 */
  pid: string
  /** 祖先或上下文描述链。 */
  descriptionContext?: readonly ProjectDescriptionContext[]
}

function cloneProjectNodeData(node: ProjectNodeData): ProjectNodeData {
  const cloned = deepClone(node)
  delete cloned.children
  return cloned
}

/**
 * 导航节点基类。
 */
export class ProjectNode {
  #node: ProjectNodeData
  #pid: string
  #descriptionContext: ProjectDescriptionContext[]

    /** 创建 Project Node 实例。 */
constructor(options: ProjectNodeModelOptions) {
    this.#node = cloneProjectNodeData(options.node)
    this.#pid = normalizePid(options.pid)
    this.#descriptionContext = [...(options.descriptionContext ?? [])]
  }

  /** 节点模型族，用于把导航节点映射到具体领域模型。 */
  get family(): ProjectNodeFamily {
    if (this.nodeKind === 'system-page') return 'system-page'
    if (this.nodeKind === 'system-action') return 'system-action'
    if (this.nodeKind === 'link') return 'link'
    if (this.nodeKind === 'ref') return 'ref'
    return 'module'
  }
    /** 执行 to Node Data 操作。 */
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
    if (!('planningAttachmentRef' in patch)) delete next.planningAttachmentRef
    if (!('implGate' in patch)) delete next.implGate
    if (!('upstreamContractsSatisfied' in patch)) delete next.upstreamContractsSatisfied

    Object.assign(next, deepClone(patch))

    if (!next.icon) delete next.icon
    if (!next.description) delete next.description
    if (!next.planningAttachmentRef) delete next.planningAttachmentRef
    if (!next.path) delete next.path
    if (next.nodeKind !== 'link' || !next.linkTarget) delete next.linkTarget
    if (!next.childPlacement) delete next.childPlacement
    if (!next.hidden) delete next.hidden
    if (!next.disabled) delete next.disabled
    if (next.context === undefined || next.context === '') delete next.context
    if (!next.dividerAfter) delete next.dividerAfter
    if (next.nodeKind !== 'ref' || !next.refId) delete next.refId
    if (!next.implGate) delete next.implGate
    if (next.upstreamContractsSatisfied !== false) delete next.upstreamContractsSatisfied
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

  /** 节点标题。 */
  get title(): string { return this.#node.title }
  /** 节点版本号或版本标签。 */
  get version(): string | undefined { return this.#node.version }
  /** 节点类型，未配置时按普通 page 处理。 */
  get nodeKind(): NavNodeKind { return this.#node.nodeKind ?? 'page' }
  /** 节点路由路径。 */
  get path(): string | undefined { return this.#node.path }
  /** 节点图标名。 */
  get icon(): string | undefined { return this.#node.icon }
  /** 是否在节点后显示分隔线。 */
  get dividerAfter(): boolean { return this.#node.dividerAfter === true }
  /** 子节点布局区域。 */
  get childPlacement(): ChildPlacement | undefined { return this.#node.childPlacement }
  /** link 节点的打开目标。 */
  get linkTarget(): ProjectNodeData['linkTarget'] | undefined { return this.#node.linkTarget }
  /** 节点是否隐藏。 */
  get hidden(): boolean { return this.#node.hidden === true }
  /** 节点是否禁用。 */
  get disabled(): boolean { return this.#node.disabled === true }
  /** 同级排序值，未配置时为 0。 */
  get order(): number { return typeof this.#node.order === 'number' ? this.#node.order : 0 }
  /** ref 节点引用的目标节点 ID。 */
  get refId(): string | undefined { return this.#node.refId }
  /** ref 节点解析后的目标路径。 */
  get refPath(): string | undefined { return this.#node.refPath }
  /** ref 节点引用的目标项目 ID。 */
  get refProjectId(): string | undefined { return this.#node.refProjectId }
  /** ref 引用是否已失效。 */
  get refBroken(): boolean | undefined { return this.#node.refBroken }
  /** 导航上下文配置或选项。 */
  get context(): ProjectNodeData['context'] { return this.#node.context }
  /** 权限不匹配时的展示策略。 */
  get permissionMode(): NavPermissionMode | undefined { return this.#node.permissionMode }
  /** 节点策划详细说明附件引用。 */
  get planningAttachmentRef(): string | undefined { return this.#node.planningAttachmentRef }
  /** pageDesign 实现放行闸门。 */
  get implGate(): ProjectPageNodeSummary['implGate'] { return this.#node.implGate }
  /** 上游契约是否已就绪。 */
  get upstreamContractsSatisfied(): boolean | undefined { return this.#node.upstreamContractsSatisfied }

  /**
   * 节点描述。
   */
  get description(): string { return readProjectNodeDescription(this.#node) }

  protected get effectiveDescription(): string { return formatProjectDescriptionContext(this.#descriptionContext) }
  protected get descriptionContext(): ProjectDescriptionContext[] { return [...this.#descriptionContext] }
    /** 执行 rebind Navigation Node 操作。 */
rebindNavigationNode(node: ProjectNodeData, pid: string, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this.#node = cloneProjectNodeData(node)
    this.#pid = normalizePid(pid)
    this.#descriptionContext = [...descriptionContext]
  }
}

