import type { StreamDisplayEntry } from '../types'

export type SessionStreamViewProps = Readonly<{
  entries: readonly StreamDisplayEntry[]
  isStreaming: boolean
  isReasoning: boolean
  emptyText?: string
}>
