/** HTTP 请求拦截器安装工具、路径工具、pageId 断言。 */

import type { HttpClientBase, RequestInterceptor } from '@spark-view/spark-utils'

/** 断言 pageId 是非空字符串，返回 trim 后的值。 */
export function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

/** 去除 URL/路径尾部斜杠。 */
export function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

export function installHeaderInterceptor(http: HttpClientBase, getHeaders: (() => Record<string, string>) | undefined): void {
  if (getHeaders === undefined) return
  const interceptor: RequestInterceptor = {
    onRequest: (config) => {
      config.headers = { ...config.headers, ...getHeaders() }
      return config
    },
  }
  http.interceptors.request.use(interceptor)
}
