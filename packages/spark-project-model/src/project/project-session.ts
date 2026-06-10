import type { NavigationNodeDraft } from '../navigation/navigation-edit'
import type { ProjectNode } from '../navigation/project-node'
import type { ConfigPageNode } from '../page/config-page'
import type { ProjectNavigationDirtyScope } from './project-types'

export type ProjectSessionState = {
  selectedNodeId: string | null
  activePageId: string | null
  navigationDirty: boolean
  navigationDirtyScope: ProjectNavigationDirtyScope | null
}

type ProjectSessionOwner = {
  findNodeById(nodeId: string): ProjectNode | null
  findConfigPageByPageId(pageId: string): ConfigPageNode | null
}

/**
 * ProjectModel 持有的设计过程态：选中、活动页、dirty 与导航草稿（不落盘）。
 * @vcmSession 运行时过程态；不落盘，无独立序列化。
 */
export class ProjectSession {
  private readonly state: ProjectSessionState = {
    selectedNodeId: null,
    activePageId: null,
    navigationDirty: false,
    navigationDirtyScope: null,
  }

  private navigationDraftValue: NavigationNodeDraft | null = null

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

  setNavigationDraft(draft: NavigationNodeDraft | null): void {
    this.navigationDraftValue = draft
  }

  beginNavigationDraft(draft: NavigationNodeDraft): NavigationNodeDraft {
    this.navigationDraftValue = draft
    return this.navigationDraftValue
  }

  discardNavigationDraft(): void {
    this.navigationDraftValue = null
    this.markNavigationClean()
  }

  markNavigationDirty(scope: ProjectNavigationDirtyScope): void {
    this.state.navigationDirty = true
    this.state.navigationDirtyScope = scope === 'root'
      ? 'root'
      : (this.state.navigationDirtyScope ?? 'node')
  }

  markNavigationClean(): void {
    this.state.navigationDirty = false
    this.state.navigationDirtyScope = null
    this.navigationDraftValue = null
  }

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
