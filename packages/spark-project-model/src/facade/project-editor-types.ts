import type { HttpClientBase } from '@spark-appworks/spark-utils'
import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../model/navigation/node'
import type { NavigationNodeEditInputDto } from '../model/navigation/edit'
import type { PageNodeFileName } from '../model/page/file'
import type { PageNodeFileStorage } from '../factory/page-node-factory'

export type ProjectEditorLoadOptions = {
  forceReload?: boolean
}

export type CreatePageForSelectedNodeParams = {
  pageId: string
  title?: string
  icon?: string
}

export type ProjectEditorSnapshot = {
  pageId: string
  navigationRoot: ProjectModelData
  treeData: ProjectNodeData[]
  selectedNode: ProjectNodeData | null
  selectedNodeId: string | null
  navigationLocation: ProjectNodeLocation | null
  navigationEditDto: NavigationNodeEditInputDto | null
  pageFeatures: ProjectPageNodeSummary[]
  ruleJson: string
  pageDataJson: string
  script: string
  style: string
  dirtyFiles: Set<PageNodeFileName>
  parseErrors: Record<PageNodeFileName, string | null>
  isLoaded: boolean
  hasAnyFileDirty: boolean
  navigationDirty: boolean
  hasAnyDirty: boolean
}

export type CreateProjectEditorOptions = {
  projectId: string
  http: HttpClientBase
  getPageFilesApi: () => string
  getNavigationApi: () => string
  getProjectsApi?: () => string
  getProjectNavigationApi?: (projectId: string) => string
  getHeaders?: () => Record<string, string>
  fileStorage?: PageNodeFileStorage
}
