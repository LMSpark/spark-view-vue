/**
 * @module app:services/requirement-import-headless
 * 职责：requirementImport 隔离式 headless ProjectWorkspace 工厂与 registry getter。
 * 边界：只创建/解析 headless editor，不执行 Host Run 或导航落盘。
 * AI用途：requirementImport Host Run 需要隔离式 ProjectWorkspace 时，用本模块获取 editor 实例。
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectNavigationApi, getProjectPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

/** Requirement Import Editor Resolve Context 的运行上下文。 */
export type RequirementImportEditorResolveContext = Readonly<{
  /** 模块实例 ID，用于在 headlessRegistry 中查找对应的 ProjectWorkspace 实例；必须事先由 createHeadlessRequirementImportEditor 注册。 */
  moduleInstanceId: string
}>

/** Headless Requirement Import Editor Scope 的语义模型。 */
export type HeadlessRequirementImportEditorScope = Readonly<{
  /** 租户 ID，用于多租户场景下隔离 API 请求的作用域；未提供时从用户会话推断。 */
  tenantId?: string
  /** 项目 ID，决定 ProjectWorkspace 绑定的项目；未提供时回退到用户默认项目或 'homepage'。 */
  projectId?: string
}>

export function createHeadlessRequirementImportEditor(
  scope?: string | HeadlessRequirementImportEditorScope,
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

export function resolveRequirementImportEditor(
  context: RequirementImportEditorResolveContext,
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): ProjectWorkspace {
  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless requirementImport editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createRequirementImportEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): (context: { moduleInstanceId: string }) => ProjectWorkspace {
  return (context) => resolveRequirementImportEditor(
    { moduleInstanceId: context.moduleInstanceId },
    headlessRegistry,
  )
}
