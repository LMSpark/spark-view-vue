import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/node'
import type { NavigationNodeDraft } from '../navigation/edit'
import type { PageNodeFileName } from '../page/file'

export type ProjectNavigationDirtyScope = 'node' | 'root'

export type ProjectModelEvent =
  | {
      type: 'navigation.changed'
      projectId: string
      revision: number
      scope: ProjectNavigationDirtyScope
      nodeId?: string
    }
  | {
      type: 'selection.changed'
      projectId: string
      revision: number
      nodeId: string | null
      pageId: string | null
    }
  | {
      type: 'page.file.changed'
      projectId: string
      revision: number
      pageId: string
      fileName: PageNodeFileName
    }
  | {
      type: 'runtime.changed'
      projectId: string
      revision: number
      pageId?: string
    }

export type ProjectModelEventListener = (event: ProjectModelEvent) => void

export type ProjectPageFileWriteCommand = {
  pageId?: string | undefined
  fileName: PageNodeFileName
  text: string
}

export type ProjectNavigationProjection = {
  navigationRoot: ProjectModelData
  treeData: ProjectNodeData[]
  selectedNode: ProjectNodeData | null
  selectedNodeId: string | null
  navigationLocation: ProjectNodeLocation | null
  navigationDraft: NavigationNodeDraft | null
  pageFeatures: ProjectPageNodeSummary[]
}

export type ProjectActivePageProjection = {
  pageId: string
  ruleJson: string
  pageDataJson: string
  script: string
  style: string
  parseErrors: Record<PageNodeFileName, string | null>
  isLoaded: boolean
}

export type ProjectDirtyProjection = {
  dirtyFiles: Set<PageNodeFileName>
  hasAnyFileDirty: boolean
  navigationDirty: boolean
  hasAnyDirty: boolean
}

export type ProjectInfo = {
  tenantId?: string | undefined
  projectId: string
  name: string
  projectType: string
  icon?: string | undefined
  description: string
  homeNodeId?: string | undefined
  order: number
  createdAt?: string | undefined
  updatedAt?: string | undefined
}

export type ProjectInfoInput = Partial<Omit<ProjectInfo, 'projectId'>> & {
  projectId?: string | undefined
}

/** 纯领域构造参数（无 IO）。 */
export type ProjectModelInitOptions = {
  projectId: string
  project?: ProjectInfoInput | undefined
}
