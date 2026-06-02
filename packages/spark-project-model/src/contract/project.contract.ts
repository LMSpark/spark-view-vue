import type { AppNavRoot, NavNode, NavigationNodeEditInputDto, NavNodeLocation } from './navigation.contract'
import type { ProjectPageNodeSummary } from './node.contract'

export type ProjectModelDto = {
  projectId: string
  navigation: AppNavRoot
  pages: ProjectPageNodeSummary[]
}

export type ProjectEditorSnapshot = {
  pageId: string; navigationRoot: AppNavRoot; treeData: NavNode[]
  selectedNode: NavNode | null; selectedNodeId: string | null
  navigationLocation: NavNodeLocation | null; navigationEditDto: NavigationNodeEditInputDto | null
  pageFeatures: ProjectPageNodeSummary[]
  ruleJson: string; pageDataJson: string; script: string; style: string
  dirtyFiles: Set<string>; parseErrors: Record<string, string | null>
  isLoaded: boolean; hasAnyFileDirty: boolean; navigationDirty: boolean; hasAnyDirty: boolean
}
