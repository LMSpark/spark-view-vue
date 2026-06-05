/**
 * pageDesign 门面实例选用策略。
 *
 * - DevSystem 面板内（interactive）：`getAppProjectEditor()`，与手动编辑同一 `editor.project`
 * - Host Run / SSE（isolated）：headless `createProjectEditor()`，按 pageId 注册、运行后丢弃
 */
import { createProjectEditor, type ProjectEditor } from '@spark-appworks/spark-project-model/project'
import { getNavApi, getPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'
import { getAppProjectEditor } from '@/services/project-editor-host'

export type PageDesignEditorResolveContext = {
  moduleInstanceId: string
  /** DevSystem 面板内 AI 会话：共用 APP 门面单例 */
  useAppSingleton?: boolean
}

export function createHeadlessPageDesignEditor(): ProjectEditor {
  return createProjectEditor({
    projectId: getUser()?.defaultProjectId ?? 'homepage',
    http,
    getPageFilesApi: getPageApi,
    getNavigationApi: getNavApi,
    getHeaders: createAuthHeaders,
  })
}

export function resolvePageDesignEditor(
  context: PageDesignEditorResolveContext,
  headlessRegistry: ReadonlyMap<string, ProjectEditor>,
): ProjectEditor {
  if (context.useAppSingleton === true) {
    return getAppProjectEditor()
  }

  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless pageDesign editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createPageDesignEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectEditor>,
  options?: { useAppSingleton?: boolean },
): (context: { moduleInstanceId: string }) => ProjectEditor {
  const useAppSingleton = options?.useAppSingleton === true
  return (context) => resolvePageDesignEditor(
    { moduleInstanceId: context.moduleInstanceId, useAppSingleton },
    headlessRegistry,
  )
}
