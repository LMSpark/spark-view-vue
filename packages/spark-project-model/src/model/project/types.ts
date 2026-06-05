import type { ProjectModelData, ProjectPageNodeSummary } from '../navigation/node'
import type {
  PageFileCache,
  PageFileContentLoader,
  PageFileWriter,
} from '../page/file'

export type ProjectModelDto = {
  projectId: string
  project: ProjectInfo
  navigation: ProjectModelData
  pages: ProjectPageNodeSummary[]
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

export type ProjectModelOptions = {
  projectId: string
  project?: ProjectInfoInput | undefined
  fileApi: PageFileWriter
  fileCache: PageFileCache
  contentLoaderFactory: () => PageFileContentLoader
}
