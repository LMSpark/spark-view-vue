import type { NavigationConfigClient } from '../io/navigation/client'
import type {
  ProjectPageReference,
  ProjectReferenceClient,
  ProjectSummary,
} from '../io/reference/client'

export class ReferenceQuery {
  constructor(
    private readonly navClient: NavigationConfigClient,
    private readonly projectReferenceClient: ProjectReferenceClient | null,
    private readonly projectId: string,
  ) {}

  async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.navClient.probeLink(url)
  }

  async listReferenceProjects(): Promise<ProjectSummary[]> {
    return this.requireClient().listProjects({
      excludeProjectId: this.projectId,
    })
  }

  async listReferenceProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    return this.requireClient().listProjectPages(projectId)
  }

  private requireClient(): ProjectReferenceClient {
    if (this.projectReferenceClient !== null) return this.projectReferenceClient
    throw new Error('ProjectReferenceClient 未配置，无法读取跨项目引用')
  }
}
