import { computed, defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'
import { SparkPageRenderer } from '@spark-view/spark-component'
import {
  compileRule,
  parseCss,
  parsePageData,
  parseScript,
} from '@spark-view/spark-page-config'
import type {
  ConfigLoader,
  ConfigLoadResult,
  PageConfig,
  PageCssConfig,
  PageDataConfig,
  PageScriptConfig,
  RuleConfig,
} from '@spark-view/spark-page-config'
import { createRequest, Logger } from '@spark-view/spark-utils'
import type { HttpClient, RequestConfig } from '@spark-view/spark-utils'

const logger = Logger('CrossProjectRefPage')

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function isNotFoundError(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; response?: { status?: unknown } }
  return candidate.status === 404 || candidate.response?.status === 404
}

function isUnauthorizedError(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; response?: { status?: unknown } }
  return candidate.status === 401 || candidate.response?.status === 401
}

function stripQueryAndHash(path: string): string {
  return path.split('#', 1)[0]?.split('?', 1)[0] ?? path
}

function resolveRefRelativePath(refPath: string): string | null {
  const trimmed = refPath.trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('@app:')) {
    const slashIndex = trimmed.indexOf('/')
    if (slashIndex < 0) return null
    return stripQueryAndHash(trimmed.slice(slashIndex))
  }
  return stripQueryAndHash(trimmed)
}

function resolveRefPageId(refPath: string): string | null {
  const relativePath = resolveRefRelativePath(refPath)
  if (relativePath === null) return null
  const pageId = relativePath.replace(/^\/+/, '').replace(/\/+$/, '')
  return pageId === '' ? null : pageId
}

function mergeHeaders(
  headers: Record<string, string> | undefined,
  scopedHeaders: Record<string, string>,
): Record<string, string> {
  return { ...(headers ?? {}), ...scopedHeaders }
}

function rewriteScopedUrl(
  url: string,
  tenantId: string,
  hostProjectId: string | null,
  targetProjectId: string,
): string {
  let nextUrl = url.replace('{tenantId}', encodeURIComponent(tenantId))
  nextUrl = nextUrl.replace('{projectId}', encodeURIComponent(targetProjectId))

  if (hostProjectId === null || hostProjectId === targetProjectId) {
    return nextUrl
  }

  const scopedPath = `/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(hostProjectId)}/`
  const targetScopedPath = `/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(targetProjectId)}/`
  return nextUrl.includes(scopedPath) ? nextUrl.replace(scopedPath, targetScopedPath) : nextUrl
}

function createScopedHttpClient(
  baseClient: HttpClient,
  scopedHeaders: Record<string, string>,
  tenantId: string,
  hostProjectId: string | null,
  targetProjectId: string,
): HttpClient {
  const mergeConfig = (config?: Partial<RequestConfig>): Partial<RequestConfig> => ({
    ...(config ?? {}),
    headers: mergeHeaders(config?.headers, scopedHeaders),
  })

  const rewriteConfig = (config: RequestConfig): RequestConfig => ({
    ...config,
    url: rewriteScopedUrl(config.url, tenantId, hostProjectId, targetProjectId),
    headers: mergeHeaders(config.headers, scopedHeaders),
  })

  return {
    interceptors: baseClient.interceptors,
    request<T = unknown>(config: RequestConfig): Promise<T> {
      return baseClient.request<T>(rewriteConfig(config))
    },
    requestFull<T = unknown>(config: RequestConfig) {
      return baseClient.requestFull<T>(rewriteConfig(config))
    },
    get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>) {
      return baseClient.get<T>(rewriteScopedUrl(url, tenantId, hostProjectId, targetProjectId), params, mergeConfig(config))
    },
    post<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>) {
      return baseClient.post<T>(rewriteScopedUrl(url, tenantId, hostProjectId, targetProjectId), data, mergeConfig(config))
    },
    put<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>) {
      return baseClient.put<T>(rewriteScopedUrl(url, tenantId, hostProjectId, targetProjectId), data, mergeConfig(config))
    },
    patch<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>) {
      return baseClient.patch<T>(rewriteScopedUrl(url, tenantId, hostProjectId, targetProjectId), data, mergeConfig(config))
    },
    delete<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>) {
      return baseClient.delete<T>(rewriteScopedUrl(url, tenantId, hostProjectId, targetProjectId), params, mergeConfig(config))
    },
    clearCache(url?: string): void {
      if (url === undefined) {
        baseClient.clearCache()
        return
      }
      baseClient.clearCache(rewriteScopedUrl(url, tenantId, hostProjectId, targetProjectId))
    },
  }
}

type FileResponse = {
  content?: unknown
  timestamp?: unknown
  notModified?: unknown
}

class CrossProjectPageConfigLoader implements ConfigLoader {
  private client: HttpClient
  private readonly basePath: string

  constructor(client: HttpClient, basePath: string) {
    this.client = client
    this.basePath = basePath
  }

  clearCache(): void {
    this.client.clearCache()
  }

  getCacheStats(): { size: number; keys: string[] } {
    return { size: 0, keys: [] }
  }

  getHttpClient(): HttpClient {
    return this.client
  }

  async loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    return this.loadRequired(pageId, 'rule.json', compileRule)
  }

  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    return this.loadRequired(pageId, 'pagedata.json', parsePageData)
  }

  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    return this.loadOptional(pageId, 'script.js', parseScript)
  }

  async loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    return this.loadOptional(pageId, 'style.css', parseCss)
  }

  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    const ruleResult = await this.loadRule(pageId)
    if (!ruleResult.success || !ruleResult.data) {
      return {
        success: false,
        ...(ruleResult.reason !== undefined && { reason: ruleResult.reason }),
        ...(ruleResult.error !== undefined && { error: ruleResult.error }),
        timestamp: ruleResult.timestamp ?? Date.now(),
      }
    }

    const dataResult = await this.loadPageData(pageId)
    if (!dataResult.success || !dataResult.data) {
      return {
        success: false,
        ...(dataResult.reason !== undefined && { reason: dataResult.reason }),
        ...(dataResult.error !== undefined && { error: dataResult.error }),
        timestamp: dataResult.timestamp ?? Date.now(),
      }
    }

    const [scriptResult, cssResult] = await Promise.all([
      this.loadScript(pageId),
      this.loadCss(pageId),
    ])

    return {
      success: true,
      data: {
        pageId,
        rule: ruleResult.data,
        data: dataResult.data,
        script: scriptResult.data,
        css: cssResult.data,
      },
      source: 'remote',
      timestamp: Date.now(),
    }
  }

  private async loadRequired<T>(
    pageId: string,
    filename: string,
    transform: (content: string) => T,
  ): Promise<ConfigLoadResult<T>> {
    try {
      const text = await this.readFile(pageId, filename)
      return { success: true, data: transform(text), source: 'remote', timestamp: Date.now() }
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return { success: false, reason: 'not-found', error: `${pageId}/${filename} 不存在`, timestamp: Date.now() }
      }
      if (isUnauthorizedError(error)) {
        return { success: false, error: `加载 ${pageId}/${filename} 未授权`, timestamp: Date.now() }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, timestamp: Date.now() }
    }
  }

  private async loadOptional<T extends string>(
    pageId: string,
    filename: string,
    transform: (content: string) => T,
  ): Promise<ConfigLoadResult<T>> {
    try {
      const text = await this.readFile(pageId, filename)
      return { success: true, data: transform(text), source: 'remote', timestamp: Date.now() }
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return { success: true, data: transform(''), source: 'remote', timestamp: Date.now() }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, timestamp: Date.now() }
    }
  }

  private async readFile(pageId: string, filename: string): Promise<string> {
    const encodedPageId = encodeURIComponent(pageId)
    const encodedFileName = encodeURIComponent(filename)
    const url = `${this.basePath}/${encodedPageId}/${encodedFileName}`
    const result = await this.client.request<FileResponse>({
      url,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    const content = result.content
    if (typeof content !== 'string') {
      throw new Error(`配置接口返回无效内容: ${pageId}/${filename}`)
    }
    return content
  }
}

export const CrossProjectRefPage = defineComponent({
  name: 'SparkCrossProjectRefPage',
  props: {
    configLoader: {
      type: Object as () => ConfigLoader,
      required: true,
    },
  },
  setup(props) {
    const route = useRoute()

    const tenantId = computed(() => asNonEmptyString(route.params['tenantId']))
    const hostProjectId = computed(() => asNonEmptyString(route.params['projectId']))
    const targetProjectId = computed(() => asNonEmptyString(route.meta['refProjectId']))
    const targetRefPath = computed(() => asNonEmptyString(route.meta['refPath']))
    const targetPageId = computed(() => {
      const explicit = asNonEmptyString(route.meta['refPageId'])
      if (explicit !== null) return explicit
      const refPath = targetRefPath.value
      return refPath === null ? null : resolveRefPageId(refPath)
    })

    const scopedLoader = computed<ConfigLoader | null>(() => {
      const scopedTenantId = tenantId.value
      const currentHostProjectId = hostProjectId.value
      const scopedProjectId = targetProjectId.value
      if (scopedTenantId === null || scopedProjectId === null) return null

      const baseClient = props.configLoader.getHttpClient?.() ?? createRequest()
      const scopedClient = createScopedHttpClient(baseClient, {
        'X-Tenant-Id': scopedTenantId,
        'X-Project-Id': scopedProjectId,
      }, scopedTenantId, currentHostProjectId, scopedProjectId)

      return new CrossProjectPageConfigLoader(
        scopedClient,
        `/tenants/${encodeURIComponent(scopedTenantId)}/projects/${encodeURIComponent(scopedProjectId)}/pages-config`,
      )
    })

    const errorMessage = computed(() => {
      if (tenantId.value === null) return '缺少 tenantId，无法解析引用页面'
      if (targetProjectId.value === null) return '缺少目标项目 ID，无法解析引用页面'
      if (targetRefPath.value === null) return '缺少 refPath，无法解析引用页面'
      if (targetPageId.value === null) return '无法从 refPath 推断目标页面 ID'
      return null
    })

    return () => {
      if (errorMessage.value !== null || scopedLoader.value === null || targetPageId.value === null) {
        const message = errorMessage.value ?? '引用页面加载器初始化失败'
        logger.error('跨项目引用页初始化失败', {
          route: route.fullPath,
          tenantId: tenantId.value,
          refProjectId: targetProjectId.value,
          refPath: targetRefPath.value,
          pageId: targetPageId.value,
          message,
        })
        return h('div', { class: 'spark-cross-project-ref-error' }, message)
      }

      return h(SparkPageRenderer, {
        key: `${targetProjectId.value}:${targetPageId.value}`,
        pageId: targetPageId.value,
        configLoader: scopedLoader.value,
      })
    }
  },
})