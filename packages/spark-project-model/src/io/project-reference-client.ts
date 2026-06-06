import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import type { ProjectModelData, ProjectPageNodeSummary } from '../model/navigation/node'
import { buildProjectPageSummaries } from '../model/navigation/helpers'

export type ProjectReferenceClientOptions = {
  http: HttpClientBase
  getProjectsApi: () => string
  getProjectNavigationApi: (projectId: string) => string
}

export type ProjectSummary = {
  projectId: string
  name: string
  icon: string
  description: string
}

export type ProjectPageReference = ProjectPageNodeSummary & {
  projectId: string
}

export type ListProjectReferencesOptions = {
  excludeProjectId?: string
}

export class ProjectReferenceClient {
  private readonly http: HttpClientBase
  private readonly getProjectsApi: () => string
  private readonly getProjectNavigationApi: (projectId: string) => string

  constructor(options: ProjectReferenceClientOptions) {
    this.http = options.http
    this.getProjectsApi = options.getProjectsApi
    this.getProjectNavigationApi = options.getProjectNavigationApi
  }

  async listProjects(options: ListProjectReferencesOptions = {}): Promise<ProjectSummary[]> {
    const rows = await this.http.get<unknown>(this.getProjectsApi())
    const excludeProjectId = options.excludeProjectId?.trim()
    return normalizeProjectRows(rows)
      .filter(project => project.projectId !== '' && project.projectId !== excludeProjectId)
  }

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
