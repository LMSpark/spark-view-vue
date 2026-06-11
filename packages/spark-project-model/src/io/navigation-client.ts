/**
 * @module @spark-appworks/spark-project-model:io/navigation-client
 * @spark-appworks/spark-project-model 的 io/navigation-client 模块。
 * 导出 ClassModel symbol: NavigationClientOptions, LinkProbeResult, NavigationClient（共 3 个 symbol）。
 */
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

/** Navigation Client Options 的调用配置。 */
export type NavigationClientOptions = {
    /** get Navigation Api 回调。 */
getNavigationApi: () => string
    /** http 字段。 */
http: HttpClientBase
}

/** Link Probe Result 的返回结果。 */
export type LinkProbeResult = {
    /** embeddable 字段。 */
embeddable: boolean
    /** reason 字段。 */
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

/** Navigation Client 的语义模型。 */
export class NavigationClient {
  private readonly getNavigationApi: () => string
  private readonly http: HttpClientBase

    /** 创建 Navigation Client 实例。 */
constructor(options: NavigationClientOptions) {
    this.getNavigationApi = options.getNavigationApi
    this.http = options.http
  }

    /** 加载 Root。 */
async loadRoot(): Promise<ProjectModelData> {
    const config = await this.http.get<Partial<ProjectModelData>>(this.baseUrl())
    return normalizeNavRoot(config)
  }

    /** 执行 add Node 操作。 */
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

    /** 执行 update Node 操作。 */
async updateNode(id: string, patch: NavigationNodePatch): Promise<ProjectNodeData> {
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
      patch,
    )
    return extractProjectNodeData(response)
  }

    /** 删除 Node。 */
async deleteNode(id: string): Promise<ProjectNodeData | null> {
    const response = await this.http.delete<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}`,
    )
    return extractOptionalProjectNodeData(response)
  }

    /** 执行 move Node 操作。 */
async moveNode(id: string, newParentId: string | null, index: number): Promise<ProjectNodeData> {
    const body: NavigationNodeMoveRequestDto = { newParentId, index }
    const response = await this.http.put<Record<string, unknown>>(
      `${this.baseUrl()}/nodes/${encodeURIComponent(id)}/move`,
      body,
    )
    return extractProjectNodeData(response)
  }

    /** 执行 probe Link 操作。 */
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
