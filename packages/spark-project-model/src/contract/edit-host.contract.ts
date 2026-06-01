import type {
  DataSetCrudTool,
  SparkNodeTree,
  SparkNodeTreeMethodKey,
} from '@spark-view/spark-data'

export type PageDesignEditPhase = 'idle' | 'editing' | 'saved'

export type PageDesignNodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>

export type PageDesignEditHost = {
  getNodeTree?: () => PageDesignNodeTree | null
  onNodeTreeChanged?: (nodeTree: PageDesignNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}
