import type { HttpClient } from '@spark-view/spark-utils'
import { PageConfigNavigationDataService } from './navigation-data-service'
import { PageConfigDataService } from './page-config-data-service'
import { PageConfigProjectDataService } from './project-data-service'
import type {
  CreatePageConfigPageInput,
  EnsurePageConfigEntryResult,
  PageConfigNavigationChangeHandler,
  PageConfigDataServiceOptions,
} from './types'

export interface CreatePageConfigWorkspaceDataServiceOptions {
  http: HttpClient
  getPageConfigApi: () => string
  getNavApi: () => string
  getProjectApi: () => string
  getTenantId?: () => string | undefined
  getHeaders?: () => Record<string, string>
  onNavigationChanged?: PageConfigNavigationChangeHandler
  createLoader?: PageConfigDataServiceOptions['createLoader']
  fileStorage?: PageConfigDataServiceOptions['fileStorage']
}

export class PageConfigWorkspaceDataService {
  readonly pageConfig: PageConfigDataService
  readonly navigation: PageConfigNavigationDataService
  readonly projects: PageConfigProjectDataService

  constructor(options: {
    pageConfig: PageConfigDataService
    navigation: PageConfigNavigationDataService
    projects: PageConfigProjectDataService
  }) {
    this.pageConfig = options.pageConfig
    this.navigation = options.navigation
    this.projects = options.projects
  }

  async ensurePageConfigEntry(
    input: CreatePageConfigPageInput,
  ): Promise<EnsurePageConfigEntryResult> {
    const page = await this.pageConfig.ensurePage(input)
    const navNode = await this.navigation.ensurePageNode(input)
    return {
      pageCreated: page.created,
      navNodeCreated: navNode.created,
    }
  }
}

export function createPageConfigWorkspaceDataService(
  options: CreatePageConfigWorkspaceDataServiceOptions,
): PageConfigWorkspaceDataService {
  return new PageConfigWorkspaceDataService({
    pageConfig: new PageConfigDataService({
      http: options.http,
      getPageConfigApi: options.getPageConfigApi,
      ...(options.getHeaders !== undefined ? { getHeaders: options.getHeaders } : {}),
      ...(options.createLoader !== undefined ? { createLoader: options.createLoader } : {}),
      ...(options.fileStorage !== undefined ? { fileStorage: options.fileStorage } : {}),
    }),
    navigation: new PageConfigNavigationDataService({
      http: options.http,
      getNavApi: options.getNavApi,
      ...(options.onNavigationChanged !== undefined ? { onNavigationChanged: options.onNavigationChanged } : {}),
    }),
    projects: new PageConfigProjectDataService({
      http: options.http,
      getProjectApi: options.getProjectApi,
      ...(options.getTenantId !== undefined ? { getTenantId: options.getTenantId } : {}),
    }),
  })
}
