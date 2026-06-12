/**
 * @module app:services/project-planning/project-planning-headless
 * 职责：projectPlanning 隔离式 headless ProjectWorkspace 工厂与 registry getter。
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectNavigationApi, getProjectPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

/** Project Planning Editor Resolve Context 的运行上下文。 */
export type ProjectPlanningEditorResolveContext = Readonly<{
  moduleInstanceId: string
}>

/** Headless Project Planning Editor Scope 的语义模型。 */
export type HeadlessProjectPlanningEditorScope = Readonly<{
  tenantId?: string
  projectId?: string
}>

export function createHeadlessProjectPlanningEditor(
  scope?: string | HeadlessProjectPlanningEditorScope,
): ProjectWorkspace {
  const explicitTenantId = typeof scope === 'string' ? undefined : scope?.tenantId?.trim()
  const explicitProjectId = (typeof scope === 'string' ? scope : scope?.projectId)?.trim()
  const defaultProjectId = getUser()?.defaultProjectId.trim()
  const resolvedProjectId = explicitProjectId !== undefined && explicitProjectId.length > 0
    ? explicitProjectId
    : defaultProjectId !== undefined && defaultProjectId.length > 0
      ? defaultProjectId
      : 'homepage'
  return new ProjectWorkspace({
    projectId: resolvedProjectId,
    http,
    getPageFilesApi: () => getProjectPageApi(resolvedProjectId, explicitTenantId),
    getNavigationApi: () => getProjectNavigationApi(resolvedProjectId, explicitTenantId),
    getHeaders: createAuthHeaders,
  })
}

export function resolveProjectPlanningEditor(
  context: ProjectPlanningEditorResolveContext,
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): ProjectWorkspace {
  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless projectPlanning editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createProjectPlanningEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): (context: { moduleInstanceId: string }) => ProjectWorkspace {
  return (context) => resolveProjectPlanningEditor(
    { moduleInstanceId: context.moduleInstanceId },
    headlessRegistry,
  )
}
