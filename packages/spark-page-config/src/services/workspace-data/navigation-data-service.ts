import type {
  CreatePageConfigPageInput,
  CreatePageConfigNavNodeInput,
  PageConfigLinkProbeResult,
  PageConfigNavConfig,
  PageConfigNavigationDataServiceOptions,
  PageConfigNavNode,
  PageConfigNavNodeSummary,
} from './types'

export class PageConfigNavigationDataService {
  private readonly http: PageConfigNavigationDataServiceOptions['http']
  private readonly getNavApi: () => string
  private readonly onNavigationChanged: PageConfigNavigationDataServiceOptions['onNavigationChanged'] | undefined

  constructor(options: PageConfigNavigationDataServiceOptions) {
    this.http = options.http
    this.getNavApi = options.getNavApi
    this.onNavigationChanged = options.onNavigationChanged
  }

  loadConfig(): Promise<PageConfigNavConfig> {
    return this.http.get<PageConfigNavConfig>(this.getNavApi())
  }

  async saveConfig(root: PageConfigNavConfig): Promise<void> {
    await this.http.put(this.getNavApi(), root)
    await this.notifyNavigationChanged()
  }

  async saveNode(
    nodeId: string,
    patch: Omit<PageConfigNavNode, 'children'> | Record<string, unknown>,
  ): Promise<void> {
    await this.http.put(`${this.getNavApi()}/nodes/${encodeURIComponent(nodeId)}`, patch)
    await this.notifyNavigationChanged()
  }

  createNode(input: CreatePageConfigNavNodeInput): Promise<unknown> {
    return this.http.post(`${this.getNavApi()}/nodes`, input)
  }

  deleteNode(nodeId: string): Promise<unknown> {
    return this.http.delete(`${this.getNavApi()}/nodes/${encodeURIComponent(nodeId)}`)
  }

  async listNodes(): Promise<PageConfigNavNodeSummary[]> {
    return await this.http.get<PageConfigNavNodeSummary[]>(`${this.getNavApi()}/nodes`)
  }

  async ensurePageNode(input: CreatePageConfigPageInput): Promise<{ created: boolean }> {
    const nodes = await this.listNodes()
    if (nodes.some(node => PageConfigNavigationDataService.nodeMatchesPage(node, input.pageId))) {
      return { created: false }
    }
    await this.createNode({
      node: {
        id: input.pageId,
        title: input.title,
        icon: input.icon,
        nodeKind: 'page',
        path: `/${input.pageId}`,
      },
    })
    return { created: true }
  }

  async probeLinkTarget(url: string): Promise<PageConfigLinkProbeResult> {
    const result = await this.http.post<Record<string, unknown>>(`${this.getNavApi()}/link-probe`, { url })
    return {
      embeddable: Boolean(result['embeddable']),
      reason: String(result['reason'] ?? ''),
    }
  }

  private async notifyNavigationChanged(): Promise<void> {
    await this.onNavigationChanged?.()
  }

  private static nodeMatchesPage(
    node: Pick<PageConfigNavNode, 'id' | 'path'>,
    pageId: string,
  ): boolean {
    return node.id === pageId || (node.path ?? '').trim().replace(/^\/+/, '') === pageId
  }
}
