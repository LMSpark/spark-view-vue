import type { HttpClient } from '@spark-view/spark-utils'
import type { AppNavRoot, NavNode } from './nav-model'
import { normalizeNavRoot } from './nav-editing'

export interface NavigationConfigClientOptions {
  getNavigationApi: () => string
  http: HttpClient
}

export interface LinkProbeResult {
  embeddable: boolean
  reason: string
}

export class NavigationConfigClient {
  private readonly getNavigationApi: () => string
  private readonly http: HttpClient

  constructor(options: NavigationConfigClientOptions) {
    this.getNavigationApi = options.getNavigationApi
    this.http = options.http
  }

  async loadRoot(): Promise<AppNavRoot> {
    const config = await this.http.get<Partial<AppNavRoot>>(this.baseUrl())
    return normalizeNavRoot(config)
  }

  async saveRoot(root: AppNavRoot): Promise<void> {
    await this.http.put(this.baseUrl(), root)
  }

  async addNode(params: { parentId?: string | null; node: NavNode; index?: number }): Promise<NavNode> {
    const response = await this.http.post<Record<string, unknown>>(`${this.baseUrl()}/nodes`, {
      ...(params.parentId === undefined || params.parentId === null ? {} : { parentId: params.parentId }),
      node: params.node,
      ...(params.index === undefined ? {} : { index: params.index }),
    })
    return (response['node'] ?? params.node) as NavNode
  }

  async updateNode(id: string, patch: Partial<NavNode>): Promise<NavNode> {
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
      patch,
    )
    return (response['node'] ?? patch) as NavNode
  }

  async deleteNode(id: string): Promise<NavNode | null> {
    const response = await this.http.delete<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
    )
    return (response['deleted'] ?? null) as NavNode | null
  }

  async moveNode(id: string, newParentId: string | null, index: number): Promise<NavNode> {
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}/move`,
      { newParentId, index },
    )
    return response['node'] as NavNode
  }

  async probeLink(url: string): Promise<LinkProbeResult> {
    const result = await this.http.post<Record<string, unknown>>(`${this.baseUrl()}/link-probe`, { url })
    return {
      embeddable: Boolean(result['embeddable']),
      reason: String(result['reason'] ?? ''),
    }
  }

  private baseUrl(): string {
    return this.getNavigationApi().replace(/\/+$/, '')
  }
}
