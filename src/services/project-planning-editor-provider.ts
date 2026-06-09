/**
 * projectPlanning 门面实例选用策略（无 UI）。
 *
 * - headless run / Host Run：按 projectId 注册临时 ProjectWorkspace，运行后丢弃
 * - 调用方也可直接注入已加载 navigation 的 editor（测试 / 编排层）
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectNavigationApi, getProjectPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

export type ProjectPlanningEditorResolveContext = Readonly<{
  moduleInstanceId: string
}>

export function createHeadlessProjectPlanningEditor(projectId?: string): ProjectWorkspace {
  const explicitProjectId = projectId?.trim()
  const defaultProjectId = getUser()?.defaultProjectId.trim()
  const resolvedProjectId = explicitProjectId !== undefined && explicitProjectId.length > 0
    ? explicitProjectId
    : defaultProjectId !== undefined && defaultProjectId.length > 0
      ? defaultProjectId
      : 'homepage'
  return new ProjectWorkspace({
    projectId: resolvedProjectId,
    http,
    getPageFilesApi: () => getProjectPageApi(resolvedProjectId),
    getNavigationApi: () => getProjectNavigationApi(resolvedProjectId),
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
