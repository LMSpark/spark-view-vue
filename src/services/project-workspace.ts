/**
 * APP 层 ProjectWorkspace 缓存。
 */
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectApi, getProjectNavigationApi, getProjectPageApi, type ProjectApiScope } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

export type ProjectWorkspaceScope = {
  tenantId: string
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
