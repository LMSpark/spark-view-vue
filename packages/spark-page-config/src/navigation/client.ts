import type { HttpClientBase } from '@spark-view/spark-utils'
import type { AppNavRoot, NavNode } from './nav-model'
import { normalizeNavRoot } from './nav-editing'

export interface NavigationConfigClientOptions {
  getNavigationApi: () => string
  http: HttpClientBase
}

export interface LinkProbeResult {
  embeddable: boolean
  reason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNavNode(value: unknown): value is NavNode {
  if (!isRecord(value)) return false
  const record = value
  return typeof record['id'] === 'string' && typeof record['title'] === 'string'
}

function extractNavNode(response: Record<string, unknown>): NavNode {
  if (isNavNode(response['node'])) return response['node']
  throw new Error('服务器响应缺少节点数据')
}

function extractOptionalNavNode(response: Record<string, unknown>): NavNode | null {
  return isNavNode(response['deleted']) ? response['deleted'] : null
}

export class NavigationConfigClient {
  private readonly getNavigationApi: () => string
  private readonly http: HttpClientBase

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
    return extractNavNode(response)
  }

  async updateNode(id: string, patch: Partial<NavNode>): Promise<NavNode> {
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
      patch,
    )
    return extractNavNode(response)
  }

  async deleteNode(id: string): Promise<NavNode | null> {
    const response = await this.http.delete<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
    )
    return extractOptionalNavNode(response)
  }

  async moveNode(id: string, newParentId: string | null, index: number): Promise<NavNode> {
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}/move`,
      { newParentId, index },
    )
    return extractNavNode(response)
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
