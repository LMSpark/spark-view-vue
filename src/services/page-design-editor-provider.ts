/**
 * @module app:services/page-design-editor-provider
 * 职责：提供应用运行时 service 层的 page design editor provider 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * pageDesign 门面实例选用策略。
 *
 * - DevSystem 面板内：与手动编辑同一 `editor.project`
 * - 隔离运行：headless `ProjectWorkspace`，按 pageId 注册、运行后丢弃
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectNavigationApi, getProjectPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

/** Page Design Editor Resolve Context 的运行上下文。 */
export type PageDesignEditorResolveContext = {
    /** module Instance Id 标识。 */
moduleInstanceId: string
}

export function createHeadlessPageDesignEditor(): ProjectWorkspace {
  const projectId = getUser()?.defaultProjectId ?? 'homepage'
  return new ProjectWorkspace({
    projectId,
    http,
    getPageFilesApi: () => getProjectPageApi(projectId),
    getNavigationApi: () => getProjectNavigationApi(projectId),
    getHeaders: createAuthHeaders,
  })
}

export function resolvePageDesignEditor(
  context: PageDesignEditorResolveContext,
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): ProjectWorkspace {
  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless pageDesign editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createPageDesignEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): (context: { moduleInstanceId: string }) => ProjectWorkspace {
  return (context) => resolvePageDesignEditor(
    { moduleInstanceId: context.moduleInstanceId },
    headlessRegistry,
  )
}
