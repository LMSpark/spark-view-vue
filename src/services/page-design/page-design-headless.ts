/**
 * @module app:services/page-design/page-design-headless
 * 职责：pageDesign 隔离式 headless ProjectWorkspace 工厂与 registry getter。
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getProjectNavigationApi, getProjectPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

/** Page Design Editor Resolve Context 的运行上下文。 */
export type PageDesignEditorResolveContext = {
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
