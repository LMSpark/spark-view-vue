import type { ProjectModelData, ProjectPageNodeSummary } from '../navigation/node'

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

/** 纯领域构造参数（无 IO）。 */
export type ProjectModelInitOptions = {
  projectId: string
  project?: ProjectInfoInput | undefined
}

/** @deprecated 使用 ProjectModelInitOptions */
export type ProjectModelOptions = ProjectModelInitOptions
