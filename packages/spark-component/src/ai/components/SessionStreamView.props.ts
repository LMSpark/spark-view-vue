/**
 * @module @spark-appworks/spark-component:ai/components/SessionStreamView.props
 * @spark-appworks/spark-component 的 ai/components/SessionStreamView.props 模块。
 * 导出 ClassModel symbol: SessionStreamViewProps（共 1 个 symbol）。
 */
import type { StreamDisplayEntry } from '../types'

/** Session Stream View Props 的属性契约。 */
export type SessionStreamViewProps = Readonly<{
  entries: readonly StreamDisplayEntry[]
  isStreaming: boolean
  isReasoning: boolean
  emptyText?: string
}>
