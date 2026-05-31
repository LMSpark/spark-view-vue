import type { DataSetCrudTool, SparkNodeTree } from "@spark-view/spark-data"
import type { AppNavRoot, NavNode, NavDraft, NavNodeLocation } from "./navigation"
import type { PageSummary } from "./node"
export type EditorSnapshot = {
  pageId: string; navigationRoot: AppNavRoot; treeData: NavNode[]
  selectedNode: NavNode | null; selectedNodeId: string | null
  navigationLocation: NavNodeLocation | null; navigationDraft: NavDraft | null
  pageFeatures: PageSummary[]; nodeTree: SparkNodeTree | null; dataSetTool: DataSetCrudTool | null
  ruleJson: string; pageDataJson: string; script: string; style: string
  dirtyFiles: Set<string>; parseErrors: Record<string, string | null>
  isLoaded: boolean; hasAnyFileDirty: boolean; navigationDirty: boolean; hasAnyDirty: boolean
  projectPlanning: unknown
}
export type EditHost = { readTree(): EditorSnapshot; editTree(command: unknown): unknown | Promise<unknown> }
