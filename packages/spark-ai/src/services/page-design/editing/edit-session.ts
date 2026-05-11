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

type TextModelReadKey = 'readScript' | 'readStyle'
type TextModelWriteKey = 'writeScript' | 'writeStyle'

function assertPresent<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
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

  readActiveScript(): string {
    return this.readTextModel(
      'readScript',
      'readActiveScript 失败：缺少 live text model 读取器（PageDesignEditHost.readScript）',
    )
  }

  writeActiveScript(content: string): void {
    this.writeTextModel(
      'readScript',
      'writeScript',
      'writeActiveScript 失败：缺少 live text model 读写器（PageDesignEditHost.readScript/writeScript）',
      content,
    )
  }

  readActiveStyle(): string {
    return this.readTextModel(
      'readStyle',
      'readActiveStyle 失败：缺少 live text model 读取器（PageDesignEditHost.readStyle）',
    )
  }

  writeActiveStyle(content: string): void {
    this.writeTextModel(
      'readStyle',
      'writeStyle',
      'writeActiveStyle 失败：缺少 live text model 读写器（PageDesignEditHost.readStyle/writeStyle）',
      content,
    )
  }

  private readTextModel(readKey: TextModelReadKey, missingMessage: string): string {
    return assertPresent(this.host?.[readKey], missingMessage)()
  }

  private writeTextModel(
    readKey: TextModelReadKey,
    writeKey: TextModelWriteKey,
    missingMessage: string,
    content: string,
  ): void {
    const writer = assertPresent(this.host?.[writeKey], missingMessage)
    assertPresent(this.host?.[readKey], missingMessage)
    writer(content)
  }
}
