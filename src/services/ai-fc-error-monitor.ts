import type { AiFcCallRecord, AiFcErrorReportResult } from '@spark-view/spark-component'
import { getUser } from '@/services/auth'
import { http } from '@/services/http'

export interface AiFcErrorReportContext {
  source: string
  pageId?: string
  activeFile?: string
  storageKey?: string
  sessionKey?: string
}

interface AiFcErrorReportResponse {
  ok: true
  eventType: string
  reportId: string
  serverTimestamp?: number
}

function optionalText(value: string | undefined | null): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function buildBrowserContext(): Record<string, string | number> {
  const context: Record<string, string | number> = {
    href: location.href,
    pathname: location.pathname,
    title: document.title,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timestamp: Date.now(),
  }
  if (navigator.userAgent.trim() !== '') {
    context['userAgent'] = navigator.userAgent
  }
  return context
}

export async function reportAiFcError(
  record: AiFcCallRecord,
  context: AiFcErrorReportContext,
): Promise<AiFcErrorReportResult> {
  if (record.status !== 'error') {
    throw new Error('[FCErrorMonitor] 仅允许回传失败的 FC 调用')
  }

  const user = getUser()
  const pageId = optionalText(context.pageId)
  const activeFile = optionalText(context.activeFile)
  const storageKey = optionalText(context.storageKey)
  const sessionKey = optionalText(context.sessionKey)
  const payload = {
    source: context.source,
    fcCall: record,
    context: {
      ...(pageId !== undefined ? { pageId } : {}),
      ...(activeFile !== undefined ? { activeFile } : {}),
      ...(storageKey !== undefined ? { storageKey } : {}),
      ...(sessionKey !== undefined ? { sessionKey } : {}),
      ...(user !== null ? {
        tenantId: user.tenantId,
        projectId: user.defaultProjectId,
        userId: user.userId,
        username: user.username,
      } : {}),
      browser: buildBrowserContext(),
    },
  }

  const response = await http.post<AiFcErrorReportResponse>('/api/ai/debug/fc-error-report', payload)
  return {
    reportId: response.reportId,
    ...(response.serverTimestamp !== undefined ? { serverTimestamp: response.serverTimestamp } : {}),
  }
}