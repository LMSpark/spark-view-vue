import type {
  PageConfigNavConfig,
  PageConfigProjectDataServiceOptions,
} from './types'

export class PageConfigProjectDataService {
  private readonly http: PageConfigProjectDataServiceOptions['http']
  private readonly getProjectApi: () => string
  private readonly getTenantId: (() => string | undefined) | undefined

  constructor(options: PageConfigProjectDataServiceOptions) {
    this.http = options.http
    this.getProjectApi = options.getProjectApi
    this.getTenantId = options.getTenantId
  }

  list(): Promise<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(this.getProjectApi())
  }

  loadNavigation(projectId: string, options?: { tenantId?: string }): Promise<PageConfigNavConfig> {
    const tenantId = options?.tenantId ?? this.getTenantId?.() ?? 'default'
    const url = `/api/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/navigation`
    return this.http.get<PageConfigNavConfig>(url)
  }
}
