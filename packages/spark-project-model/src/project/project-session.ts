/**
 * @module @spark-appworks/spark-project-model:project/project-session
 * 职责：提供项目模型层 project-session 能力，围绕 ProjectSessionState、ProjectSessionOwner、ProjectSession 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 project/project-session。
 */
import type { NavigationNodeDraft } from '../navigation/navigation-edit'
import type { ProjectNode } from '../navigation/project-node'
import type { ConfigPageNode } from '../page/config-page'
import type { ProjectNavigationDirtyScope } from './project-types'

/** Project Session State 的运行状态。 */
export type ProjectSessionState = {
    /** selected Node Id 标识。 */
selectedNodeId: string | null
    /** active Page Id 标识。 */
activePageId: string | null
    /** navigation Dirty 字段。 */
navigationDirty: boolean
    /** navigation Dirty Scope 字段。 */
navigationDirtyScope: ProjectNavigationDirtyScope | null
}

/** Project Session Owner 的语义模型。 */
type ProjectSessionOwner = {
  findNodeById(nodeId: string): ProjectNode | null
  findConfigPageByPageId(pageId: string): ConfigPageNode | null
}

/**
 * ProjectModel 持有的设计过程态：选中、活动页、dirty 与导航草稿（不落盘）。
 */
export class ProjectSession {
  private readonly state: ProjectSessionState = {
    selectedNodeId: null,
    activePageId: null,
    navigationDirty: false,
    navigationDirtyScope: null,
  }

  private navigationDraftValue: NavigationNodeDraft | null = null

    /** 创建 Project Session 实例。 */
constructor(private readonly owner: ProjectSessionOwner) {}

  get session(): Readonly<ProjectSessionState> {
    return this.state
  }

  get navigationDraft(): NavigationNodeDraft | null {
    return this.navigationDraftValue
  }

  get isNavigationEditing(): boolean {
    return this.navigationDraftValue !== null
  }

  get navigationDirty(): boolean {
    return this.state.navigationDirty
  }

    /** 设置 Navigation Draft。 */
setNavigationDraft(draft: NavigationNodeDraft | null): void {
    this.navigationDraftValue = draft
  }

    /** 执行 begin Navigation Draft 操作。 */
beginNavigationDraft(draft: NavigationNodeDraft): NavigationNodeDraft {
    this.navigationDraftValue = draft
    return this.navigationDraftValue
  }

    /** 执行 discard Navigation Draft 操作。 */
discardNavigationDraft(): void {
    this.navigationDraftValue = null
    this.markNavigationClean()
  }

    /** 执行 mark Navigation Dirty 操作。 */
markNavigationDirty(scope: ProjectNavigationDirtyScope): void {
    this.state.navigationDirty = true
    this.state.navigationDirtyScope = scope === 'root'
      ? 'root'
      : (this.state.navigationDirtyScope ?? 'node')
  }

    /** 执行 mark Navigation Clean 操作。 */
markNavigationClean(): void {
    this.state.navigationDirty = false
    this.state.navigationDirtyScope = null
    this.navigationDraftValue = null
  }

    /** set Selected Node Id 标识。 */
setSelectedNodeId(
    nodeId: string | null | undefined,
    options?: { silentIfMissing?: boolean },
  ): void {
    const normalized = nodeId?.trim() ?? ''
    if (!normalized) {
      this.state.selectedNodeId = null
      return
    }
    const exists = this.owner.findNodeById(normalized)
    if (!exists) {
      if (options?.silentIfMissing === true) {
        this.state.selectedNodeId = null
        return
      }
      throw new Error(`项目节点未找到: ${normalized}`)
    }
    this.state.selectedNodeId = normalized
  }

    /** set Active Page Id 标识。 */
setActivePageId(pageId: string | null | undefined): void {
    const normalized = pageId?.trim() ?? ''
    if (!normalized) {
      this.state.activePageId = null
      return
    }
    const existing = this.owner.findConfigPageByPageId(normalized)
    if (!existing) {
      throw new Error(`配置页面节点未找到: ${normalized}`)
    }
    this.state.activePageId = normalized
  }

    /** 执行 sync With Model 操作。 */
syncWithModel(): void {
    const selectedNodeId = this.state.selectedNodeId
    if (selectedNodeId && !this.owner.findNodeById(selectedNodeId)) {
      this.state.selectedNodeId = null
    }
    const activePageId = this.state.activePageId
    if (activePageId && !this.owner.findConfigPageByPageId(activePageId)) {
      this.state.activePageId = null
    }
  }
}

