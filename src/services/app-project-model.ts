/**
 * @module app:services/app-project-model
 * 职责：提供主应用 app-project-model 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/app-project-model。
 */
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
