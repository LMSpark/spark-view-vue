/** HTTP 客户端辅助：路径归一化、请求头拦截器。 */

import type { HttpClientBase, RequestInterceptor } from '@spark-appworks/spark-utils'

/** 去除 URL/路径尾部斜杠。 */
export function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

export function installHeaderInterceptor(
  http: HttpClientBase,
  getHeaders: (() => Record<string, string>) | undefined,
): void {
  if (getHeaders === undefined) return
  const interceptor: RequestInterceptor = {
    onRequest: (config) => {
      config.headers = { ...config.headers, ...getHeaders() }
      return config
    },
  }
  http.interceptors.request.use(interceptor)
}
