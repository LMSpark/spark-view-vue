import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/project-node'
import type { NavigationNodeDraft } from '../navigation/navigation-edit'
import type { PageNodeFileName } from '../page/page-file'

export type ProjectNavigationDirtyScope = 'node' | 'root'

export type ProjectModelEvent =
  | {
      type: 'navigation.changed'
      projectId: string
      revision: number
      scope: ProjectNavigationDirtyScope
      nodeId?: string
    }
  | {
      type: 'selection.changed'
      projectId: string
      revision: number
      nodeId: string | null
      pageId: string | null
    }
  | {
      type: 'page.file.changed'
      projectId: string
      revision: number
      pageId: string
      fileName: PageNodeFileName
    }
  | {
      type: 'runtime.changed'
      projectId: string
      revision: number
      pageId?: string
    }

export type ProjectModelEventListener = (event: ProjectModelEvent) => void

export type ProjectPageFileWriteCommand = {
  /** 目标配置页 pageId；省略时使用当前 activePage。 */
  pageId?: string | undefined
  /** 要写入的页面四文件名。 */
  fileName: PageNodeFileName
  /** 新的文件文本内容，只写入内存模型，落盘由工作区编排。 */
  text: string
}

export type ProjectNavigationProjection = {
  navigationRoot: ProjectModelData
  treeData: ProjectNodeData[]
  selectedNode: ProjectNodeData | null
  selectedNodeId: string | null
  navigationLocation: ProjectNodeLocation | null
  navigationDraft: NavigationNodeDraft | null
  pageFeatures: ProjectPageNodeSummary[]
}

export type ProjectActivePageProjection = {
  pageId: string
  ruleJson: string
  pageDataJson: string
  script: string
  style: string
  parseErrors: Record<PageNodeFileName, string | null>
  isLoaded: boolean
}

export type ProjectDirtyProjection = {
  dirtyFiles: Set<PageNodeFileName>
  hasAnyFileDirty: boolean
  navigationDirty: boolean
  hasAnyDirty: boolean
}

export type ProjectInfo = {
  /** 租户 ID；多租户环境下用于隔离项目。 */
  tenantId?: string | undefined
  /** 项目唯一 ID。 */
  projectId: string
  /** 项目名称。 */
  name: string
  /** 项目类型标识。 */
  projectType: string
  /** 项目图标名。 */
  icon?: string | undefined
  /** 项目描述，供导航、规划和 AI 设计理解项目目标。 */
  description: string
  /** 项目首页导航节点 ID。 */
  homeNodeId?: string | undefined
  /** 项目排序值。 */
  order: number
  /** 项目创建时间。 */
  createdAt?: string | undefined
  /** 项目更新时间。 */
  updatedAt?: string | undefined
}

export type ProjectInfoInput = Partial<Omit<ProjectInfo, 'projectId'>> & {
  /** 可选项目 ID；未提供时由 ProjectModel 构造参数补齐。 */
  projectId?: string | undefined
}

/** 纯领域构造参数（无 IO）。 */
export type ProjectModelInitOptions = {
  /** 当前 ProjectModel 绑定的项目 ID。 */
  projectId: string
  /** 可选项目基础信息；缺省字段由 ProjectModel 使用默认值补齐。 */
  project?: ProjectInfoInput | undefined
}
