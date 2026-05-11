import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { PageDesignNodeTree } from './node-tree-types'

export type PageDesignEditPhase = 'idle' | 'editing' | 'saved'

export interface PageDesignEditHost {
  getNodeTree?: () => PageDesignNodeTree | null
  onNodeTreeChanged?: (nodeTree: PageDesignNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}

export interface PageDesignEditState {
  phase: PageDesignEditPhase
  host: PageDesignEditHost | null
}

export class PageDesignEditSession implements PageDesignEditState {
  phase: PageDesignEditPhase = 'idle'

  host: PageDesignEditHost | null = null

  bindHost(host: PageDesignEditHost): void {
    this.host = host
  }

  getActiveNodeTree(): PageDesignNodeTree | null {
    return this.host?.getNodeTree?.() ?? null
  }

  notifyNodeTreeChanged(nodeTree: PageDesignNodeTree): void {
    this.host?.onNodeTreeChanged?.(nodeTree)
  }

  getActiveDataSetTool(): DataSetCrudTool | null {
    return this.host?.getDataSetTool?.() ?? null
  }

  notifyDataSetChanged(tool: DataSetCrudTool): void {
    this.host?.onDataSetChanged?.(tool)
  }
}
