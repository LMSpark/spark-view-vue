import {
  extractToolProtocolBlocks,
  stripToolProtocolBlocks,
} from '@/services/ai-protocol'
import type { ToolProtocolBlock } from '@/services/ai-protocol'

export const SAP_PROTOCOL_TYPES = ['request', 'describe'] as const

export interface SapProtocolExtraction {
  kind: 'none' | 'single' | 'multiple'
  blocks: ToolProtocolBlock[]
}

export function extractSapProtocolBlocks(text: string): SapProtocolExtraction {
  const blocks = extractToolProtocolBlocks(text, { types: [...SAP_PROTOCOL_TYPES] })

  if (blocks.length === 0) {
    return { kind: 'none', blocks }
  }

  if (blocks.length === 1) {
    return { kind: 'single', blocks }
  }

  return { kind: 'multiple', blocks }
}

export function stripSapProtocolBlocks(text: string): string {
  return stripToolProtocolBlocks(text, { types: [...SAP_PROTOCOL_TYPES] })
}