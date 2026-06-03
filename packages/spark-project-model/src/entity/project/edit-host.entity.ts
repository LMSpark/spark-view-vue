import type { ConfigPageNode } from '../node/node-factory'

export type PageDesignEditPhase = 'create' | 'update' | 'fix'

export type PageDesignNodeTree = ReturnType<ConfigPageNode['getNodeTree']>

export type PageDesignEditHost = Pick<
  ConfigPageNode,
  | 'pageId'
  | 'getNodeTree'
  | 'editNodeTree'
  | 'getRuleText'
  | 'getDataSetTool'
  | 'editDataSet'
  | 'getDataSetText'
  | 'readScript'
  | 'writeScript'
  | 'readStyle'
  | 'writeStyle'
>
