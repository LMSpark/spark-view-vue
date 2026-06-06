import type { HttpClientBase } from '@spark-appworks/spark-utils'
import type { ProjectModelData, ProjectNodeData } from '../navigation/project-node'
import { isProjectNodeData } from '../navigation/project-node'
import { normalizeNavRoot } from '../navigation/navigation-tree'
import {
  createNavigationNodeDraft,
  type NavigationNodeDraftNode,
  type NavigationNodePatch,
} from '../navigation/navigation-edit'
import { trimTrailingSlash } from './http'

export type NavigationClientOptions = {
  getNavigationApi: () => string
  http: HttpClientBase
}

export type LinkProbeResult = {
  embeddable: boolean
  reason: string
}

type NavigationNodeAddRequestDto = {
  parentId?: string | null
  index?: number
  node: NavigationNodeDraftNode
}

type NavigationNodeMoveRequestDto = {
  newParentId: string | null
  index: number
}

function extractProjectNodeData(response: Record<string, unknown>): ProjectNodeData {
  if (isProjectNodeData(response['node'])) return response['node']
  throw new Error('服务器响应缺少节点数据')
}

function extractOptionalProjectNodeData(response: Record<string, unknown>): ProjectNodeData | null {
  return isProjectNodeData(response['deleted']) ? response['deleted'] : null
}

export class NavigationClient {
  private readonly getNavigationApi: () => string
  private readonly http: HttpClientBase

  constructor(options: NavigationClientOptions) {
    this.getNavigationApi = options.getNavigationApi
    this.http = options.http
  }

  async loadRoot(): Promise<ProjectModelData> {
    const config = await this.http.get<Partial<ProjectModelData>>(this.baseUrl())
    return normalizeNavRoot(config)
  }

  async addNode(params: { parentId?: string | null; node: ProjectNodeData; index?: number }): Promise<ProjectNodeData> {
    const editDto = createNavigationNodeDraft(params.node)
    const body: NavigationNodeAddRequestDto = {
      ...(params.parentId === undefined || params.parentId === null ? {} : { parentId: params.parentId }),
      node: editDto.node,
      ...(params.index === undefined ? {} : { index: params.index }),
    }
    const response = await this.http.post<Record<string, unknown>>(`${this.baseUrl()}/nodes`, body)
    return extractProjectNodeData(response)
  }

  async updateNode(id: string, patch: NavigationNodePatch): Promise<ProjectNodeData> {
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
    return trimTrailingSlash(this.getNavigationApi())
  }
}
