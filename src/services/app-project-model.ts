import {
  ProjectModel,
  type ProjectModelData,
} from '@spark-appworks/spark-project-model'
import { getUser } from '@/services/auth'

let committedProjectModel: ProjectModel | null = null
let committedProjectId: string | null = null

function resolveProjectId(projectId?: string): string {
  const normalizedProjectId = projectId?.trim()
  if (normalizedProjectId) return normalizedProjectId
  return getUser()?.defaultProjectId ?? 'homepage'
}

export function getAppProjectModel(projectId?: string): ProjectModel {
  const normalizedProjectId = resolveProjectId(projectId)
  if (committedProjectModel === null || committedProjectId !== normalizedProjectId) {
    committedProjectModel = new ProjectModel({ projectId: normalizedProjectId })
    committedProjectId = normalizedProjectId
  }
  return committedProjectModel
}

export function resetAppProjectModel(): void {
  committedProjectModel = null
  committedProjectId = null
}

export function syncAppProjectModelFromNav(
  navRoot: ProjectModelData | null,
  projectId?: string,
): ProjectModel | null {
  if (!navRoot || !Array.isArray(navRoot.children)) return null
  const project = getAppProjectModel(projectId)
  project.replaceNavigationRoot(navRoot)
  return project
}

export function readAppProjectNavigationRoot(): ProjectModelData | null {
  return committedProjectModel?.readNavigationProjection().navigationRoot ?? null
}
