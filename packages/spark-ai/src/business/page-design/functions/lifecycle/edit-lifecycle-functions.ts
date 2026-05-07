import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { PageDesignNodeTree } from '../node-tree/types'

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditToolHost {
  getNodeTree?: () => PageDesignNodeTree | null
  onNodeTreeChanged?: (nodeTree: PageDesignNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}

export interface EditState {
  phase: EditPhase
  toolHost: EditToolHost | null
}

type TextModelReadKey = 'readScript' | 'readStyle'
type TextModelWriteKey = 'writeScript' | 'writeStyle'

function assertPresent<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

export class PageDesignEditSession implements EditState {
  phase: EditPhase = 'idle'

  toolHost: EditToolHost | null = null

  bindLiveModelAdapter(host: EditToolHost): void {
    this.toolHost = host
  }

  getActiveNodeTree(): PageDesignNodeTree | null {
    return this.toolHost?.getNodeTree?.() ?? null
  }

  notifyNodeTreeChanged(nodeTree: PageDesignNodeTree): void {
    this.toolHost?.onNodeTreeChanged?.(nodeTree)
  }

  getActiveDataSetTool(): DataSetCrudTool | null {
    return this.toolHost?.getDataSetTool?.() ?? null
  }

  notifyDataSetChanged(tool: DataSetCrudTool): void {
    this.toolHost?.onDataSetChanged?.(tool)
  }

  readActiveScript(): string {
    return this.readTextModel(
      'readScript',
      'readActiveScript 失败：缺少 live text model 读取器（EditToolHost.readScript）',
    )
  }

  writeActiveScript(content: string): void {
    this.writeTextModel(
      'readScript',
      'writeScript',
      'writeActiveScript 失败：缺少 live text model 读写器（EditToolHost.readScript/writeScript）',
      content,
    )
  }

  readActiveStyle(): string {
    return this.readTextModel(
      'readStyle',
      'readActiveStyle 失败：缺少 live text model 读取器（EditToolHost.readStyle）',
    )
  }

  writeActiveStyle(content: string): void {
    this.writeTextModel(
      'readStyle',
      'writeStyle',
      'writeActiveStyle 失败：缺少 live text model 读写器（EditToolHost.readStyle/writeStyle）',
      content,
    )
  }

  private readTextModel(readKey: TextModelReadKey, missingMessage: string): string {
    return assertPresent(this.toolHost?.[readKey], missingMessage)()
  }

  private writeTextModel(
    readKey: TextModelReadKey,
    writeKey: TextModelWriteKey,
    missingMessage: string,
    content: string,
  ): void {
    const writer = assertPresent(this.toolHost?.[writeKey], missingMessage)
    assertPresent(this.toolHost?.[readKey], missingMessage)
    writer(content)
  }
}
