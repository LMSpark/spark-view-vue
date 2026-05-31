import type { DataSetCrudTool, SparkNodeTreeMethodKey, SparkNodeTree } from "@spark-view/spark-data"
import type { NavDraft, NavContextDraft } from "./navigation"
export type PageDesignEditHost = {
  getNodeTree?: () => (Pick<SparkNodeTree, SparkNodeTreeMethodKey | "toJSON">) | null
  onNodeTreeChanged?: (nodeTree: Pick<SparkNodeTree, SparkNodeTreeMethodKey | "toJSON">) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string; writeScript?: (content: string) => void
  readStyle?: () => string; writeStyle?: (content: string) => void
  getNavDraft?: () => NavDraft | null; onNavDraftChanged?: (patch: Partial<NavDraft>) => void
  getNavContext?: () => NavContextDraft | null; onNavContextChanged?: (patch: Partial<NavContextDraft>) => void
}
