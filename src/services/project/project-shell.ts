/**
 * @module app:services/project/project-shell
 * 职责：App 层项目壳——committed ProjectModel 缓存、ProjectWorkspace 单例、导航同步、项目切换 inject。
 * 边界：不进入 spark-project-model 内核；DevSystem 编辑宿主与 committed 投影分离。
 * AI用途：切换项目、同步导航或获取 committed ProjectWorkspace 单例时，用本模块定位壳层服务。
 */
import type { InjectionKey } from 'vue'
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import {
  ProjectModel,
  ProjectWorkspace,
} from '@spark-appworks/spark-project-model'
import { getNavTree, refreshRoutes } from '@spark-appworks/spark-app'
import {
  getProjectApi,
  getProjectNavigationApi,
  getProjectPageApi,
  type ProjectApiScope,
} from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

// --- project-switch ---

/** Project Switch Service 的语义模型。 */
export type ProjectSwitchService = {
  /** 切换到指定项目并刷新壳层导航；projectId 为目标项目标识，切换后会重新加载路由和 ProjectWorkspace。 */
  switchAndReload(projectId: string): Promise<void>
}

export const PROJECT_SWITCH_KEY: InjectionKey<ProjectSwitchService> = Symbol('project-switch')

// --- app-project-model ---

let committedProjectModel: ProjectModel | null = null
let committedProjectId: string | null = null

function resolveCommittedProjectId(projectId?: string): string {
  const normalizedProjectId = projectId?.trim()
  if (normalizedProjectId) return normalizedProjectId
  return getUser()?.defaultProjectId ?? 'homepage'
}

export function getAppProjectModel(projectId?: string): ProjectModel {
  const normalizedProjectId = resolveCommittedProjectId(projectId)
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

// --- project-workspace ---

/** Project Workspace Scope 的语义模型。 */
export type ProjectWorkspaceScope = {
  /** 租户 ID，用于多租户 API 隔离；作为 ProjectWorkspace 缓存键的一部分（tenantId:projectId）。 */
  tenantId: string
  /** 项目 ID，标识 ProjectWorkspace 绑定的项目；未提供时回退到用户默认项目或 'homepage'。 */
  projectId: string
}

const projectWorkspaces = new Map<string, ProjectWorkspace>()

function resolveProjectScope(scope?: Partial<ProjectApiScope>): ProjectWorkspaceScope {
  const user = getUser()
  const scopedTenantId = scope?.tenantId?.trim()
  const scopedProjectId = scope?.projectId?.trim()
  const tenantId = scopedTenantId && scopedTenantId.length > 0
    ? scopedTenantId
    : (user?.tenantId ?? 'platform')
  const projectId = scopedProjectId && scopedProjectId.length > 0
    ? scopedProjectId
    : (user?.defaultProjectId ?? 'homepage')
  return { tenantId, projectId }
}

function toScopeKey(scope: ProjectWorkspaceScope): string {
  return `${scope.tenantId}:${scope.projectId}`
}

function createScopedProjectWorkspace(scope: ProjectWorkspaceScope): ProjectWorkspace {
  const workspace = new ProjectWorkspace({
    projectId: scope.projectId,
    http,
    getPageFilesApi: () => getProjectPageApi(scope.projectId, scope.tenantId),
    getNavigationApi: () => getProjectNavigationApi(scope.projectId, scope.tenantId),
    getProjectsApi: () => getProjectApi(scope.tenantId),
    getProjectNavigationApi: (projectId: string) => getProjectNavigationApi(projectId, scope.tenantId),
    getHeaders: createAuthHeaders,
  })
  workspace.project.replaceProjectInfo({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
  })
  return workspace
}

export function getAppProjectWorkspace(scope?: string | Partial<ProjectApiScope>): ProjectWorkspace {
  const resolvedScope = typeof scope === 'string'
    ? resolveProjectScope({ projectId: scope })
    : resolveProjectScope(scope)
  const key = toScopeKey(resolvedScope)
  let workspace = projectWorkspaces.get(key)
  if (workspace === undefined) {
    workspace = createScopedProjectWorkspace(resolvedScope)
    projectWorkspaces.set(key, workspace)
  }
  return workspace
}

export function resetAppProjectWorkspace(): void {
  projectWorkspaces.clear()
}

export function syncAppProjectWorkspaceFromNav(
  navRoot: ProjectModelData | null,
  scope?: string | Partial<ProjectApiScope>,
): ProjectWorkspace {
  const workspace = getAppProjectWorkspace(scope)
  if (navRoot && Array.isArray(navRoot.children)) {
    workspace.ingestNavigationRoot(navRoot)
  }
  return workspace
}

// --- navigation-sync ---

/** Shell Nav Root Listener 的语义模型。 */
export type ShellNavRootListener = (navData: ProjectModelData | null) => void

let shellNavRootListener: ShellNavRootListener | null = null

/** App.vue 注册：将已提交导航写入 _navRoot（驱动 useNavigation）。 */
export function registerShellNavRootListener(listener: ShellNavRootListener): () => void {
  shellNavRootListener = listener
  return () => {
    if (shellNavRootListener === listener) {
      shellNavRootListener = null
    }
  }
}

function applyShellNavRoot(navData: ProjectModelData | null): void {
  shellNavRootListener?.(navData)
}

/** 将同一份已提交导航 DTO 同步到壳层 UI 与两个 ProjectModel 实例。 */
export function syncCommittedNavigation(navData: ProjectModelData | null): void {
  syncAppProjectModelFromNav(navData)
  applyShellNavRoot(readAppProjectNavigationRoot())
  syncAppProjectWorkspaceFromNav(navData)
}

/** 从路由缓存读取已提交导航并同步（无 HTTP）。 */
export function syncCommittedNavigationFromRouter(): void {
  syncCommittedNavigation(getNavTree())
}

/**
 * 刷新路由（单次 HTTP GET）并同步壳层 + 领域实例。
 * DevSystem 保存后应使用此函数，避免 editor.reloadNavigation 再 GET。
 */
export async function reloadAndSyncNavigation(): Promise<ProjectModelData | null> {
  const navTree = await refreshRoutes()
  syncCommittedNavigation(navTree)
  return navTree
}
