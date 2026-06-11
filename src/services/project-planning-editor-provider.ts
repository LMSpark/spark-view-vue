/**
 * @module app:services/project-planning-editor-provider
 * 职责：提供应用运行时 service 层的 project planning editor provider 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
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
