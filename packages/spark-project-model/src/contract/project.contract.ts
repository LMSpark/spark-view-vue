import type { ProjectModelData, NavigationNodeEditInputDto, ProjectNodeData, ProjectNodeLocation } from './navigation.contract'
import type { ProjectPageNodeSummary } from '../entity/node/module-node.entity'

export type ProjectModelDto = {
  projectId: string
  navigation: ProjectModelData
  pages: ProjectPageNodeSummary[]
}

export type ProjectEditorSnapshot = {
  pageId: string; navigationRoot: ProjectModelData; treeData: ProjectNodeData[]
  selectedNode: ProjectNodeData | null; selectedNodeId: string | null
  navigationLocation: ProjectNodeLocation | null; navigationEditDto: NavigationNodeEditInputDto | null
  pageFeatures: ProjectPageNodeSummary[]
  ruleJson: string; pageDataJson: string; script: string; style: string
  dirtyFiles: Set<string>; parseErrors: Record<string, string | null>
  isLoaded: boolean; hasAnyFileDirty: boolean; navigationDirty: boolean; hasAnyDirty: boolean
}
