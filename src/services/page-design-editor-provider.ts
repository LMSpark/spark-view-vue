/**
 * pageDesign 门面实例选用策略。
 *
 * - DevSystem 面板内：与手动编辑同一 `editor.project`
 * - 隔离运行：headless `ProjectWorkspace`，按 pageId 注册、运行后丢弃
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model/project'
import { getProjectNavigationApi, getProjectPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'
import { getAppProjectWorkspace } from '@/services/project-workspace'

export type PageDesignEditorResolveContext = {
  moduleInstanceId: string
  useAppSingleton?: boolean
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
  if (context.useAppSingleton === true) {
    return getAppProjectWorkspace()
  }

  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless pageDesign editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createPageDesignEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
  options?: { useAppSingleton?: boolean },
): (context: { moduleInstanceId: string }) => ProjectWorkspace {
  const useAppSingleton = options?.useAppSingleton === true
  return (context) => resolvePageDesignEditor(
    { moduleInstanceId: context.moduleInstanceId, useAppSingleton },
    headlessRegistry,
  )
}
