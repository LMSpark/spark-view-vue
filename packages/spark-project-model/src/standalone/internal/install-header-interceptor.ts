/** HTTP 请求拦截器安装工具。 */

import type { HttpClientBase, RequestInterceptor } from '@spark-view/spark-utils'

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
