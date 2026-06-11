/**
 * @module @spark-appworks/spark-project-model:project/project-types
 * 职责：提供项目模型层 project-types 能力，围绕 ProjectNavigationDirtyScope、ProjectModelEvent、ProjectModelEventListener 等 12 个公开契约 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 project/project-types。
 */
import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/project-node'
import type { NavigationNodeDraft } from '../navigation/navigation-edit'
import type { PageNodeFileName } from '../page/page-file'

/** Project Navigation Dirty Scope 的语义模型。 */
export type ProjectNavigationDirtyScope = 'node' | 'root'

/** Project Model Event 的事件载荷。 */
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

/** Project Model Event Listener 的语义模型。 */
export type ProjectModelEventListener = (event: ProjectModelEvent) => void

/** Project Page File Write Command 的命令参数。 */
export type ProjectPageFileWriteCommand = {
  /** 目标配置页 pageId；省略时使用当前 activePage。 */
  pageId?: string | undefined
  /** 要写入的页面四文件名。 */
  fileName: PageNodeFileName
  /** 新的文件文本内容，只写入内存模型，落盘由工作区编排。 */
  text: string
}

/** Project Navigation Projection 的语义模型。 */
export type ProjectNavigationProjection = {
    /** navigation Root 字段。 */
navigationRoot: ProjectModelData
    /** tree Data 字段。 */
treeData: ProjectNodeData[]
    /** selected Node 字段。 */
selectedNode: ProjectNodeData | null
    /** selected Node Id 标识。 */
selectedNodeId: string | null
    /** navigation Location 字段。 */
navigationLocation: ProjectNodeLocation | null
    /** navigation Draft 字段。 */
navigationDraft: NavigationNodeDraft | null
    /** page Features 字段。 */
pageFeatures: ProjectPageNodeSummary[]
}

/** Project Active Page Projection 的语义模型。 */
export type ProjectActivePageProjection = {
    /** page Id 标识。 */
pageId: string
    /** rule Json 字段。 */
ruleJson: string
    /** page Data Json 字段。 */
pageDataJson: string
    /** script 字段。 */
script: string
    /** style 字段。 */
style: string
    /** parse Errors 字段。 */
parseErrors: Record<PageNodeFileName, string | null>
    /** 是否 is Loaded。 */
isLoaded: boolean
}

/** Project Dirty Projection 的语义模型。 */
export type ProjectDirtyProjection = {
    /** dirty Files 字段。 */
dirtyFiles: Set<PageNodeFileName>
    /** 是否 has Any File Dirty。 */
hasAnyFileDirty: boolean
    /** navigation Dirty 字段。 */
navigationDirty: boolean
    /** 是否 has Any Dirty。 */
hasAnyDirty: boolean
}

/** 项目级策划输入：短需求 + 可选详细说明附件引用。 */
export type ProjectPlanningInput = Readonly<{
  /** 项目级短需求；优先 navigation 根节点 description，否则 project.description。 */
  requirement: string
  /** 策划详细说明附件引用；正文由工作区解析后传给 LLM。 */
  planningAttachmentRef?: string
}>

/** 单个导航节点策划输入：节点 description + 可选附件引用。 */
export type NavigationPlanningInput = Readonly<{
  nodeId: string
  title: string
  nodeKind: string
  /** 节点短需求，即 navigation description。 */
  requirement: string
  planningAttachmentRef?: string
}>

/** Project Info 的语义模型。 */
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
  /** 策划详细说明附件引用（文件 ID / 工作区路径等，由 IO 层约定）。 */
  planningAttachmentRef?: string | undefined
  /** 项目首页导航节点 ID。 */
  homeNodeId?: string | undefined
  /** 项目排序值。 */
  order: number
  /** 项目创建时间。 */
  createdAt?: string | undefined
  /** 项目更新时间。 */
  updatedAt?: string | undefined
}

/** Project Info Input 的输入数据。 */
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
