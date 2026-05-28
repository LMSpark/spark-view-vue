/**
 * useSessionDiagnostics — SessionRecord → 摘要+转录+问题列表。
 *
 * computed 驱动，sessionRecord() 变化时重新计算。
 * sessionRecord() 为 null 时返回空摘要（非 null），
 * 调用 summarizeAiAgentSessionRecord(null) 和 createAiAgentSessionTranscript(null)。
 */

import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  AiAgentSessionRecord,
  AiAgentFunctionCallHistoryEntry,
} from '@spark-view/spark-ai/agent'
import {
  summarizeAiAgentSessionRecord,
  createAiAgentSessionTranscript,
  previewAiAgentDiagnosticValue,
} from '@spark-view/spark-ai/agent'
import type { SessionDiagnosticsData, SessionDiagnosticIssue } from '../types'

export type UseSessionDiagnosticsOptions = Readonly<{
  sessionRecord: () => AiAgentSessionRecord | null
}>

export type UseSessionDiagnosticsReturn = Readonly<{
  data: ComputedRef<SessionDiagnosticsData>
}>

export function useSessionDiagnostics(
  options: UseSessionDiagnosticsOptions,
): UseSessionDiagnosticsReturn {
  const data = computed<SessionDiagnosticsData>(() => {
    const record = options.sessionRecord()
    const summary = summarizeAiAgentSessionRecord(record)
    const transcript = createAiAgentSessionTranscript(record)
    const issues = extractDiagnosticIssues(record)
    return { summary, transcript, issues }
  })

  return { data } as const
}

function extractDiagnosticIssues(
  record: AiAgentSessionRecord | null,
): readonly SessionDiagnosticIssue[] {
  if (record === null) return []
  const issues: SessionDiagnosticIssue[] = []
  for (const entry of record.history) {
    if (isFailedFunctionCall(entry)) {
      issues.push({
        level: 'error',
        code: entry.error?.code ?? 'FUNCTION_CALL_FAILED',
        message: `Tool "${entry.toolName}" failed: ${previewAiAgentDiagnosticValue(entry.error, 300)}`,
      })
    }
  }
  return issues
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFailedFunctionCall(
  entry: unknown,
): entry is AiAgentFunctionCallHistoryEntry {
  if (!isPlainObject(entry)) return false
  return entry['kind'] === 'functionCall' && entry['status'] === 'failed'
}
