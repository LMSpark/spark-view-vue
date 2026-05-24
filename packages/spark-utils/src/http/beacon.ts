/**
 * sendBeacon — 页面卸载期日志/埋点上报。
 *
 * 优先使用 navigator.sendBeacon，不可用时降级为 fetch + keepalive。
 */

export function sendBeacon(url: string, data: unknown, baseURL?: string): boolean {
  const fullUrl = baseURL !== undefined
    ? `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
    : url
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  const blob = new Blob([payload], { type: 'application/json' })

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const sent = navigator.sendBeacon(fullUrl, blob)
    if (sent) return true
  }

  if (typeof fetch !== 'function') {
    return false
  }

  void fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined)
  return true
}
