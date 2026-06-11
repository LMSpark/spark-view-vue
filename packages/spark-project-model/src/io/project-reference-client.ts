/**
 * @module @spark-appworks/spark-project-model:io/project-reference-client
 * @spark-appworks/spark-project-model 的 io/project-reference-client 模块。
 * 导出 ClassModel symbol: ProjectReferenceClientOptions, ProjectSummary, ProjectPageReference, ListProjectReferencesOptions, ProjectReferenceClient（共 5 个 symbol）。
 */
import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import type { ProjectModelData, ProjectPageNodeSummary } from '../navigation/project-node'
import { buildProjectPageSummaries } from '../navigation/navigation-tree'

/** Project Reference Client Options 的调用配置。 */
export type ProjectReferenceClientOptions = {
    /** http 字段。 */
http: HttpClientBase
    /** get Projects Api 回调。 */
getProjectsApi: () => string
    /** get Project Navigation Api 回调。 */
getProjectNavigationApi: (projectId: string) => string
}

/** Project Summary 的语义模型。 */
export type ProjectSummary = {
    /** project Id 标识。 */
projectId: string
    /** 显示或业务名称。 */
name: string
    /** icon 字段。 */
icon: string
    /** description 字段。 */
description: string
}

/** Project Page Reference 的语义模型。 */
export type ProjectPageReference = ProjectPageNodeSummary & {
    /** project Id 标识。 */
projectId: string
}

/** List Project References Options 的调用配置。 */
export type ListProjectReferencesOptions = {
    /** exclude Project Id 标识。 */
excludeProjectId?: string
}

/** Project Reference Client 的语义模型。 */
export class ProjectReferenceClient {
  private readonly http: HttpClientBase
  private readonly getProjectsApi: () => string
  private readonly getProjectNavigationApi: (projectId: string) => string

    /** 创建 Project Reference Client 实例。 */
constructor(options: ProjectReferenceClientOptions) {
    this.http = options.http
    this.getProjectsApi = options.getProjectsApi
    this.getProjectNavigationApi = options.getProjectNavigationApi
  }

    /** 执行 list Projects 操作。 */
async listProjects(options: ListProjectReferencesOptions = {}): Promise<ProjectSummary[]> {
    const rows = await this.http.get<unknown>(this.getProjectsApi())
    const excludeProjectId = options.excludeProjectId?.trim()
    return normalizeProjectRows(rows)
      .filter(project => project.projectId !== '' && project.projectId !== excludeProjectId)
  }

    /** 执行 list Project Pages 操作。 */
async listProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) {
      throw new Error('projectId 不能为空')
    }
    const root = await this.http.get<Partial<ProjectModelData>>(this.getProjectNavigationApi(normalizedProjectId))
    const children = Array.isArray(root.children) ? root.children : []
    return buildProjectPageSummaries(children)
      .map(page => ({
        ...page,
        projectId: normalizedProjectId,
      }))
  }
}

function normalizeProjectRows(value: unknown): ProjectSummary[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeProjectRow)
}

function normalizeProjectRow(value: unknown): ProjectSummary {
  if (!isRecord(value)) {
    return { projectId: '', name: '', icon: '', description: '' }
  }
  const projectId = readString(value, 'projectId') || readString(value, 'id')
  return {
    projectId,
    name: readString(value, 'name') || projectId,
    icon: readString(value, 'icon'),
    description: readString(value, 'description'),
  }
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}
