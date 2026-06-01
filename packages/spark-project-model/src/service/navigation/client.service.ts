import type { HttpClientBase } from '@spark-view/spark-utils'
import type { AppNavRoot, NavNode } from './nav-model'
import { isNavNode } from './nav-model'
import { normalizeNavRoot } from './editing.service'
import type {
  NavigationNodeAddRequestDto,
  NavigationNodeEditPatchDto,
  NavigationNodeMoveRequestDto,
} from '../../contract/navigation.contract'

export type NavigationConfigClientOptions = {
  getNavigationApi: () => string
  http: HttpClientBase
}

export type LinkProbeResult = {
  embeddable: boolean
  reason: string
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

  async addNode(params: { parentId?: string | null; node: NavNode; index?: number }): Promise<NavNode> {
    const body: NavigationNodeAddRequestDto = {
      ...(params.parentId === undefined || params.parentId === null ? {} : { parentId: params.parentId }),
      node: toNavigationNodeEditDto(params.node),
      ...(params.index === undefined ? {} : { index: params.index }),
    }
    const response = await this.http.post<Record<string, unknown>>(`${this.baseUrl()}/nodes`, body)
    return extractNavNode(response)
  }

  async updateNode(id: string, patch: NavigationNodeEditPatchDto): Promise<NavNode> {
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
    const body: NavigationNodeMoveRequestDto = { newParentId, index }
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}/move`,
      body,
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

function toNavigationNodeEditDto(node: NavNode) {
  return {
    id: node.id,
    title: node.title,
    icon: node.icon ?? '',
    nodeKind: node.nodeKind ?? 'page',
    dividerAfter: node.dividerAfter ?? false,
    description: node.description ?? '',
    path: node.path ?? '',
    linkTarget: node.linkTarget ?? 'iframe',
    childPlacement: node.childPlacement ?? '',
    order: node.order ?? 0,
    hidden: node.hidden ?? false,
    disabled: node.disabled ?? false,
    refId: node.refId ?? '',
    permissionMode: node.permissionMode ?? 'masked',
  }
}
