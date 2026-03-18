import { onServerEvent } from '@spark-view/spark-utils'
import { http } from '@/services/http'

interface UploadResponse {
  fileId: string
  name: string
  size: number
  mimeType: string
}

interface DebugScreenshotRequestEvent {
  requestId?: string
  reason?: string
  selector?: string
  pageId?: string
  timestamp?: number
}

interface ScreenshotResultPayload {
  requestId?: string
  pageId?: string
  reason?: string
  status: 'success' | 'error' | 'busy'
  message?: string
  selector?: string
  resolvedSelector?: string
  url?: string
  title?: string
  textDigest?: string
  viewport?: string
  fileId?: string
  name?: string
  size?: number
  mimeType?: string
  timestamp: number
}

const DEBUG_SCREENSHOT_REQUEST_EVENT = 'debug-screenshot-request'

let _stop: (() => void) | null = null
let _capturing = false

function sanitizeUnsupportedColorFunctions(text: string): string {
  let output = text
  output = output.replace(/color-mix\([^)]*\)/gi, 'rgb(128, 128, 128)')
  output = output.replace(/color\([^)]*\)/gi, 'rgb(128, 128, 128)')
  return output
}

function sanitizeCloneStyles(clonedDoc: Document): void {
  const styleNodes = clonedDoc.querySelectorAll('style')
  for (const styleNode of styleNodes) {
    const cssText = styleNode.textContent
    if (typeof cssText !== 'string' || cssText.length === 0) continue
    styleNode.textContent = sanitizeUnsupportedColorFunctions(cssText)
  }

  const inlineStyledNodes = clonedDoc.querySelectorAll<HTMLElement>('[style]')
  for (const node of inlineStyledNodes) {
    const raw = node.getAttribute('style')
    if (typeof raw !== 'string' || raw.length === 0) continue
    node.setAttribute('style', sanitizeUnsupportedColorFunctions(raw))
  }
}

function resolveRequestId(event: DebugScreenshotRequestEvent): string | undefined {
  if (typeof event.requestId === 'string' && event.requestId.trim().length > 0) {
    return event.requestId
  }
  return undefined
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('截图失败：无法导出图片数据'))
    }, 'image/png')
  })
}

function buildFileName(event: DebugScreenshotRequestEvent): string {
  const requestId = resolveRequestId(event) ?? `req-${Date.now()}`
  const page = typeof event.pageId === 'string' && event.pageId.length > 0
    ? event.pageId.replaceAll('/', '_')
    : location.pathname.replaceAll('/', '_').replace(/^_+/, '') || 'page'
  return `debug-${page}-${requestId}.png`
}

function resolveTarget(selector?: string): HTMLElement {
  if (typeof selector === 'string' && selector.trim().length > 0) {
    const target = document.querySelector(selector)
    if (target instanceof HTMLElement) {
      return target
    }
  }
  return document.body
}

function buildTextDigest(target: HTMLElement): string | undefined {
  const raw = target.innerText.trim()
  if (!raw) return undefined
  const normalized = raw.replace(/\s+/g, ' ')
  if (normalized.length <= 180) return normalized
  return `${normalized.slice(0, 180)}…`
}

async function uploadScreenshot(blob: Blob, fileName: string): Promise<UploadResponse> {
  const file = new File([blob], fileName, { type: 'image/png' })
  const formData = new FormData()
  formData.append('file', file)
  return await http.post<UploadResponse>('/api/ai/upload', formData)
}

function buildResultPayload(
  event: DebugScreenshotRequestEvent,
  status: ScreenshotResultPayload['status'],
  extra?: Partial<ScreenshotResultPayload>,
): ScreenshotResultPayload {
  const requestId = resolveRequestId(event)
  const payload: ScreenshotResultPayload = {
    status,
    timestamp: Date.now(),
  }
  if (requestId !== undefined) payload.requestId = requestId
  if (typeof event.pageId === 'string' && event.pageId.length > 0) payload.pageId = event.pageId
  if (typeof event.reason === 'string' && event.reason.length > 0) payload.reason = event.reason
  if (typeof event.selector === 'string' && event.selector.length > 0) payload.selector = event.selector
  payload.url = location.href
  payload.title = document.title
  payload.viewport = `${window.innerWidth}x${window.innerHeight}`
  if (extra !== undefined) {
    Object.assign(payload, extra)
  }
  return payload
}

async function reportScreenshotResult(payload: ScreenshotResultPayload): Promise<void> {
  try {
    await http.post('/api/ai/debug/screenshot-result', payload)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[SSE] 截图回执上报失败', { payload, error })
    }
  }
}

async function handleScreenshotRequest(event: DebugScreenshotRequestEvent): Promise<void> {
  if (_capturing) {
    await reportScreenshotResult(buildResultPayload(event, 'busy', { message: '截图任务繁忙，已忽略本次请求' }))
    if (import.meta.env.DEV) {
      console.warn('[SSE] 正在处理截图请求，忽略新请求', event)
    }
    return
  }
  _capturing = true
  try {
    const { default: html2canvas } = await import('html2canvas')
    const target = resolveTarget(event.selector)
    const resolvedSelector = target === document.body ? 'document.body' : (event.selector ?? 'document.body')
    const textDigest = buildTextDigest(target)
    const canvas = await html2canvas(target, {
      useCORS: true,
      logging: false,
      backgroundColor: null,
      scale: Math.max(window.devicePixelRatio, 1),
      onclone: (clonedDoc) => {
        sanitizeCloneStyles(clonedDoc)
      },
    })
    const blob = await canvasToBlob(canvas)
    const uploaded = await uploadScreenshot(blob, buildFileName(event))
    await reportScreenshotResult(buildResultPayload(event, 'success', {
      message: '截图上传成功',
      resolvedSelector,
      ...(textDigest !== undefined && { textDigest }),
      fileId: uploaded.fileId,
      name: uploaded.name,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
    }))
    if (import.meta.env.DEV) {
      console.info('[SSE] 截图已上传', {
        requestId: event.requestId,
        fileId: uploaded.fileId,
        name: uploaded.name,
        size: uploaded.size,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await reportScreenshotResult(buildResultPayload(event, 'error', {
      message,
      resolvedSelector: event.selector ?? 'document.body',
    }))
    if (import.meta.env.DEV) {
      console.error('[SSE] 截图上传失败', { event, error })
    }
  } finally {
    _capturing = false
  }
}

export function startSseDebugScreenshotBridge(): () => void {
  if (_stop) return _stop
  _stop = onServerEvent<DebugScreenshotRequestEvent>(DEBUG_SCREENSHOT_REQUEST_EVENT, (event) => {
    void handleScreenshotRequest(event)
  })
  return () => {
    _stop?.()
    _stop = null
  }
}
