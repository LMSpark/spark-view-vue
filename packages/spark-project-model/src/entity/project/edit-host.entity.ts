import type { DataSetCrudTool, SparkNodeTree } from '@spark-view/spark-data'

export type PageDesignEditPhase = 'create' | 'update' | 'fix'

export type PageDesignNodeTree = SparkNodeTree

export type PageDesignEditHost = {
  readonly pageId: string

  getNodeTree(): PageDesignNodeTree
  replaceNodeTree(tree: PageDesignNodeTree): void
  editNodeTree(run: (tree: PageDesignNodeTree) => void | Promise<void>): Promise<void>
  getRuleText(): string

  getDataSetTool(): DataSetCrudTool
  replaceDataSetTool(tool: DataSetCrudTool): void
  editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void>
  getDataSetText(): string

  readScript(): string
  writeScript(content: string): void

  readStyle(): string
  writeStyle(content: string): void
}
