import { refreshRoutes } from '@spark-view/spark-app'
import { createPageConfigWorkspaceDataService } from '@spark-view/spark-page-config/services'
import { getNavApi, getPageApi, getProjectApi } from './api-paths'
import { getUser } from './auth'
import { createAuthHeaders, http } from './http'

export const pageConfigWorkspaceDataService = createPageConfigWorkspaceDataService({
  http,
  getPageConfigApi: getPageApi,
  getNavApi,
  getProjectApi,
  getTenantId: () => getUser()?.tenantId,
  getHeaders: createAuthHeaders,
  onNavigationChanged: async () => {
    await refreshRoutes()
  },
})
