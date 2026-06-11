/**
 * @module app:services/project-workspace
 * 职责：提供应用运行时 service 层的 project workspace 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 层 ProjectWorkspace 缓存。
 */
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectApi, getProjectNavigationApi, getProjectPageApi, type ProjectApiScope } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

/** Project Workspace Scope 的语义模型。 */
export type ProjectWorkspaceScope = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
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
  return new ProjectWorkspace({
    projectId: scope.projectId,
    http,
    getPageFilesApi: () => getProjectPageApi(scope.projectId, scope.tenantId),
    getNavigationApi: () => getProjectNavigationApi(scope.projectId, scope.tenantId),
    getProjectsApi: () => getProjectApi(scope.tenantId),
    getProjectNavigationApi: (projectId: string) => getProjectNavigationApi(projectId, scope.tenantId),
    getHeaders: createAuthHeaders,
  })
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
