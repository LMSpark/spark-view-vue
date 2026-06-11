/**
 * @module @spark-appworks/spark-component:ai/components/SessionDiagnosticsPanel.props
 * @spark-appworks/spark-component 的 ai/components/SessionDiagnosticsPanel.props 模块。
 * 导出 ClassModel symbol: SessionDiagnosticsPanelProps（共 1 个 symbol）。
 */
import type { SessionDiagnosticsData } from '../types'

/** Session Diagnostics Panel Props 的属性契约。 */
export type SessionDiagnosticsPanelProps = Readonly<{
  data: SessionDiagnosticsData
  loading?: boolean
}>
