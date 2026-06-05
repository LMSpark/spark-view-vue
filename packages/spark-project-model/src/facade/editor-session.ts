import type { NavigationNodeEditInputDto } from '../model/navigation/edit'
import type { ProjectNode } from '../model/navigation/node'
import type { ConfigPageNode } from '../model/page/config-page'

export type ProjectEditorNavigationDirtyScope = 'node' | 'root'

export type ProjectEditorSessionState = {
  selectedNodeId: string | null
  activePageId: string | null
  navigationDirty: boolean
  navigationDirtyScope: ProjectEditorNavigationDirtyScope | null
}

export type ProjectEditorListener = () => void

type EditorSessionHost = {
  findNodeById(nodeId: string): ProjectNode | null
  findConfigPageByPageId(pageId: string): ConfigPageNode | null
}

/** 设计过程态：选中、活动页、dirty、导航工作副本、revision 与 subscribe。 */
export class EditorSession {
  private readonly state: ProjectEditorSessionState = {
    selectedNodeId: null,
    activePageId: null,
    navigationDirty: false,
    navigationDirtyScope: null,
  }

  private workingEditDto: NavigationNodeEditInputDto | null = null
  private revisionCounter = 0
  private readonly listeners = new Set<ProjectEditorListener>()

  constructor(private readonly host: EditorSessionHost) {}

  get revision(): number {
    return this.revisionCounter
  }

  get session(): Readonly<ProjectEditorSessionState> {
    return this.state
  }

  get navigationEditDto(): NavigationNodeEditInputDto | null {
    return this.workingEditDto
  }

  get isNavigationEditing(): boolean {
    return this.workingEditDto !== null
  }

  get navigationDirty(): boolean {
    return this.state.navigationDirty || this.workingEditDto !== null
  }

  subscribe(listener: ProjectEditorListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  bump(): void {
    this.revisionCounter += 1
    for (const listener of this.listeners) {
      listener()
    }
  }

  setWorkingEditDto(dto: NavigationNodeEditInputDto | null): void {
    this.workingEditDto = dto
  }

  beginNavigationEdit(dto: NavigationNodeEditInputDto): NavigationNodeEditInputDto {
    this.workingEditDto = dto
    return this.workingEditDto
  }

  discardNavigationEdit(): void {
    this.workingEditDto = null
    this.markNavigationClean()
  }

  markNavigationDirty(scope: ProjectEditorNavigationDirtyScope): void {
    this.state.navigationDirty = true
    this.state.navigationDirtyScope = scope === 'root'
      ? 'root'
      : (this.state.navigationDirtyScope ?? 'node')
  }

  markNavigationClean(): void {
    this.state.navigationDirty = false
    this.state.navigationDirtyScope = null
    this.workingEditDto = null
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
    const exists = this.host.findNodeById(normalized)
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
    const existing = this.host.findConfigPageByPageId(normalized)
    if (!existing) {
      throw new Error(`配置页面节点未找到: ${normalized}`)
    }
    this.state.activePageId = normalized
  }

  syncWithModel(): void {
    const selectedNodeId = this.state.selectedNodeId
    if (selectedNodeId && !this.host.findNodeById(selectedNodeId)) {
      this.state.selectedNodeId = null
    }
    const activePageId = this.state.activePageId
    if (activePageId && !this.host.findConfigPageByPageId(activePageId)) {
      this.state.activePageId = null
    }
  }
}
