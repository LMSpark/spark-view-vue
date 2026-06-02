import type { HttpClientBase } from '@spark-view/spark-utils'
import type { ProjectModelData, ProjectNodeData } from '../../entity/node/node-base.entity'
import { isProjectNodeData } from '../../entity/node/node-base.entity'
import { normalizeNavRoot } from '../../entity/node/node-helpers'
import type {
  NavigationNodeAddRequestDto,
  NavigationNodeEditPatchDto,
  NavigationNodeMoveRequestDto,
} from '../../entity/navigation/edit.entity'

export type NavigationConfigClientOptions = {
  getNavigationApi: () => string
  http: HttpClientBase
}

export type LinkProbeResult = {
  embeddable: boolean
  reason: string
}

function extractProjectNodeData(response: Record<string, unknown>): ProjectNodeData {
  if (isProjectNodeData(response['node'])) return response['node']
  throw new Error('服务器响应缺少节点数据')
}

function extractOptionalProjectNodeData(response: Record<string, unknown>): ProjectNodeData | null {
  return isProjectNodeData(response['deleted']) ? response['deleted'] : null
}

export class NavigationConfigClient {
  private readonly getNavigationApi: () => string
  private readonly http: HttpClientBase

  constructor(options: NavigationConfigClientOptions) {
    this.getNavigationApi = options.getNavigationApi
    this.http = options.http
  }

  async loadRoot(): Promise<ProjectModelData> {
    const config = await this.http.get<Partial<ProjectModelData>>(this.baseUrl())
    return normalizeNavRoot(config)
  }

  async addNode(params: { parentId?: string | null; node: ProjectNodeData; index?: number }): Promise<ProjectNodeData> {
    const body: NavigationNodeAddRequestDto = {
      ...(params.parentId === undefined || params.parentId === null ? {} : { parentId: params.parentId }),
      node: toNavigationNodeEditDto(params.node),
      ...(params.index === undefined ? {} : { index: params.index }),
    }
    const response = await this.http.post<Record<string, unknown>>(`${this.baseUrl()}/nodes`, body)
    return extractProjectNodeData(response)
  }

  async updateNode(id: string, patch: NavigationNodeEditPatchDto): Promise<ProjectNodeData> {
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
      patch,
    )
    return extractProjectNodeData(response)
  }

  async deleteNode(id: string): Promise<ProjectNodeData | null> {
    const response = await this.http.delete<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
    )
    return extractOptionalProjectNodeData(response)
  }

  async moveNode(id: string, newParentId: string | null, index: number): Promise<ProjectNodeData> {
    const body: NavigationNodeMoveRequestDto = { newParentId, index }
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}/move`,
      body,
    )
    return extractProjectNodeData(response)
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

function toNavigationNodeEditDto(node: ProjectNodeData) {
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
