/**
 * APP 层 ProjectEditor 宿主 — 当前登录项目的唯一**门面实例**。
 *
 * 模型与实例勿混：
 * - **模型（类型）**：`spark-project-model` 包定义 `ProjectModel`、`ProjectEditor` 等 class，包内无全局单例。
 * - **领域实例**：`editor.project`（`ProjectModel`），承载 design + runtime 状态。
 * - **门面实例**：`getAppProjectEditor()` 返回的 `ProjectEditor`（含 session、io 协作者）。
 *
 * 登录 / 刷新路由后由壳层 `ingestNavigationRoot` 灌入导航；DevSystem、AI 共用同一门面实例。
 */
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { createProjectEditor, type ProjectEditor } from '@spark-appworks/spark-project-model/project'
import { getPageApi, getNavApi, getProjectApi, getProjectNavigationApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

let hostedEditor: ProjectEditor | null = null
let hostedProjectId: string | null = null

function resolveProjectId(): string {
  return getUser()?.defaultProjectId ?? 'homepage'
}

function createHostedEditor(projectId: string): ProjectEditor {
  return createProjectEditor({
    projectId,
    http,
    getPageFilesApi: getPageApi,
    getNavigationApi: getNavApi,
    getProjectsApi: getProjectApi,
    getProjectNavigationApi,
    getHeaders: createAuthHeaders,
  })
}

/** 当前项目的 ProjectEditor 门面单例（按 defaultProjectId 懒创建 / 切项目时重建）。 */
export function getAppProjectEditor(): ProjectEditor {
  const projectId = resolveProjectId()
  if (hostedEditor === null || hostedProjectId !== projectId) {
    hostedEditor = createHostedEditor(projectId)
    hostedProjectId = projectId
  }
  return hostedEditor
}

/** 登出或切租户前丢弃宿主，下次 get 会重建。 */
export function resetAppProjectEditor(): void {
  hostedEditor = null
  hostedProjectId = null
}

/**
 * 将 spark-app 已加载的导航树灌入模型（与 DynamicRouter / refreshRoutes 同源）。
 * 在 login、register、项目切换、页面刷新后调用。
 */
export function syncAppProjectEditorFromNav(navRoot: ProjectModelData | null): ProjectEditor {
  const editor = getAppProjectEditor()
  if (navRoot && Array.isArray(navRoot.children)) {
    editor.ingestNavigationRoot(navRoot)
  }
  return editor
}
