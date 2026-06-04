import { createProjectEditor } from '@spark-appworks/spark-project-model/project'
import { getPageApi, getNavApi, getProjectApi, getProjectNavigationApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'

export function createDevSystemProjectEditor() {
  return createProjectEditor({
    projectId: getUser()?.defaultProjectId ?? 'homepage',
    http,
    getPageFilesApi: getPageApi,
    getNavigationApi: getNavApi,
    getProjectsApi: getProjectApi,
    getProjectNavigationApi,
    getHeaders: createAuthHeaders,
  })
}
