import { computed, defineComponent, h, ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
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
  PageConfigFileName,
  PageCssConfig,
  PageDataConfig,
  PageScriptConfig,
  RuleConfig,
} from '@spark-view/spark-page-config'
import { createRequest, Logger } from '@spark-view/spark-utils'
import type { HttpClient, RequestConfig } from '@spark-view/spark-utils'
import type { AppNavRoot, NavNode } from '../navigation/nav-model'
import { getNavTree } from '../navigation/nav-access'

interface ReloadableRenderer {
  reload?: () => Promise<void>
}

interface ParsedRefPath {
  projectId: string | null
  pageId: string | null
}

interface ResolvedRefTarget {
  hostRefNodeId: string | null
  targetProjectId: string | null
  refPath: string | null
  pageId: string | null
}

export interface CrossProjectRefPageRouteProps {
  configLoader: ConfigLoader
  tenantId?: string
  hostProjectId?: string
  routePath?: string
  routeMeta?: Record<string, unknown>
}

type FileResponse = {
  content?: unknown
  timestamp?: unknown
  notModified?: unknown
}

const logger = Logger('CrossProjectRefPage')

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function createCrossProjectRefRouteProps(configLoader: ConfigLoader) {
  return (route: RouteLocationNormalizedLoaded): CrossProjectRefPageRouteProps => {
    const tenantId = asNonEmptyString(route.params['tenantId'])
    const hostProjectId = asNonEmptyString(route.params['projectId'])
    return {
      configLoader,
      routePath: route.path,
      routeMeta: { ...route.meta },
      ...(tenantId !== null && { tenantId }),
      ...(hostProjectId !== null && { hostProjectId }),
    }
  }
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

function normalizePath(path: string): string {
  const trimmed = stripQueryAndHash(path).trim()
  if (trimmed === '') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.length === 1) return withLeadingSlash
  return withLeadingSlash.replace(/\/+$/, '')
}

function stripTenantProjectPrefix(path: string): string {
  const normalized = normalizePath(path)
  const match = /^\/t\/[^/]+\/[^/]+(\/.*)?$/.exec(normalized)
  return normalizePath(match?.[1] ?? normalized)
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function resolveHostRefNodeId(routePath: string): string | null {
  const segments = stripTenantProjectPrefix(routePath).split('/').filter(Boolean)
  const refIndex = segments.indexOf('__ref')
  const refNodeId = refIndex >= 0 ? segments[refIndex + 1] : undefined
  return refNodeId === undefined ? null : decodePathSegment(refNodeId)
}

function safePageId(value: unknown, hostRefNodeId: string | null): string | null {
  const pageId = asNonEmptyString(value)
  if (pageId === null || pageId === hostRefNodeId) return null
  return pageId
}

function lastPathSegment(path: string): string | null {
  const normalized = normalizePath(path)
  const segments = normalized.split('/').filter(Boolean)
  return segments.length === 0 ? null : (segments[segments.length - 1] ?? null)
}

function parseRefPath(refPath: string | null): ParsedRefPath {
  if (refPath === null) return { projectId: null, pageId: null }

  const trimmed = refPath.trim()
  const appMatch = /^@app:([^/]+)(\/.*)?$/.exec(trimmed)
  if (appMatch !== null) {
    return {
      projectId: asNonEmptyString(appMatch[1]),
      pageId: appMatch[2] === undefined ? null : lastPathSegment(appMatch[2]),
    }
  }

  return {
    projectId: null,
    pageId: lastPathSegment(trimmed),
  }
}

function refNodeHostPath(node: NavNode): string {
  const explicitPath = asNonEmptyString(node.path)
  if (explicitPath !== null && normalizePath(explicitPath).includes('/__ref/')) {
    return explicitPath
  }
  return `/__ref/${encodeURIComponent(node.id)}`
}

function findRefNodeById(nodes: NavNode[], refNodeId: string): NavNode | null {
  for (const node of nodes) {
    if (node.nodeKind === 'ref' && node.id === refNodeId) return node
    if (node.children?.length) {
      const match = findRefNodeById(node.children, refNodeId)
      if (match !== null) return match
    }
  }
  return null
}

function findRefNodeByHostPath(nodes: NavNode[], routePath: string): NavNode | null {
  const targetPath = stripTenantProjectPrefix(routePath)
  for (const node of nodes) {
    if (node.nodeKind === 'ref' && stripTenantProjectPrefix(refNodeHostPath(node)) === targetPath) {
      return node
    }
    if (node.children?.length) {
      const match = findRefNodeByHostPath(node.children, routePath)
      if (match !== null) return match
    }
  }
  return null
}

function findRouteRefNode(navTree: AppNavRoot | null, routePath: string, hostRefNodeId: string | null): NavNode | null {
  if (navTree === null) return null
  if (hostRefNodeId !== null) {
    const byId = findRefNodeById(navTree.children, hostRefNodeId)
    if (byId !== null) return byId
  }
  return findRefNodeByHostPath(navTree.children, routePath)
}

function resolveRefTarget(
  navTree: AppNavRoot | null,
  routePath: string,
  routeMeta: Record<string, unknown>,
  hostProjectId: string | null,
): ResolvedRefTarget {
  const hostRefNodeId = resolveHostRefNodeId(routePath)
  const refNode = findRouteRefNode(navTree, routePath, hostRefNodeId)
  const refPath = asNonEmptyString(refNode?.refPath) ?? asNonEmptyString(routeMeta['refPath'])
  const parsedRefPath = parseRefPath(refPath)

  const targetProjectId =
    asNonEmptyString(refNode?.refProjectId) ??
    asNonEmptyString(routeMeta['refProjectId']) ??
    parsedRefPath.projectId ??
    hostProjectId

  const pageId =
    parsedRefPath.pageId ??
    safePageId(routeMeta['refPageId'], hostRefNodeId) ??
    safePageId(routeMeta['pageId'], hostRefNodeId) ??
    safePageId(refNode?.refId, hostRefNodeId)

  return {
    hostRefNodeId,
    targetProjectId,
    refPath,
    pageId,
  }
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

class CrossProjectPageConfigLoader implements ConfigLoader {
  private readonly client: HttpClient
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

  async loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
  ): Promise<ConfigLoadResult<string>> {
    try {
      return { success: true, data: await this.readFile(pageId, filename), source: 'remote', timestamp: Date.now() }
    } catch (error: unknown) {
      if (!isNotFoundError(error)) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, timestamp: Date.now() }
      }
      return { success: false, reason: 'not-found', error: `${pageId}/${filename} 不存在`, timestamp: Date.now() }
    }
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
    if (!scriptResult.success) {
      return {
        success: false,
        ...(scriptResult.reason !== undefined && { reason: scriptResult.reason }),
        ...(scriptResult.error !== undefined && { error: scriptResult.error }),
        timestamp: scriptResult.timestamp ?? Date.now(),
      }
    }
    if (!cssResult.success) {
      return {
        success: false,
        ...(cssResult.reason !== undefined && { reason: cssResult.reason }),
        ...(cssResult.error !== undefined && { error: cssResult.error }),
        timestamp: cssResult.timestamp ?? Date.now(),
      }
    }

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
        return { success: false, reason: 'not-found', error: `${pageId}/${filename} 不存在`, timestamp: Date.now() }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, timestamp: Date.now() }
    }
  }

  private async readFile(pageId: string, filename: string): Promise<string> {
    const encodedPageId = encodeURIComponent(pageId)
    const encodedFileName = encodeURIComponent(filename)
    const result = await this.client.request<FileResponse>({
      url: `${this.basePath}/${encodedPageId}/${encodedFileName}`,
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
    tenantId: {
      type: String,
      required: false,
    },
    hostProjectId: {
      type: String,
      required: false,
    },
    routePath: {
      type: String,
      required: false,
    },
    routeMeta: {
      type: Object as () => Record<string, unknown>,
      required: false,
      default: () => ({}),
    },
  },
  setup(props, { expose }) {
    const pageRendererRef = ref<ReloadableRenderer | null>(null)
    let lastLoggedErrorKey: string | null = null

    expose({
      async reload() {
        await pageRendererRef.value?.reload?.()
      },
    })

    const tenantId = computed(() => asNonEmptyString(props.tenantId))
    const hostProjectId = computed(() => asNonEmptyString(props.hostProjectId))
    const routePath = computed(() => {
      const resolved = asNonEmptyString(props.routePath)
      return resolved ?? '/'
    })
    const routeMeta = computed(() => props.routeMeta)
    const refTarget = computed(() =>
      resolveRefTarget(getNavTree(), routePath.value, routeMeta.value, hostProjectId.value)
    )
    const targetProjectId = computed(() => refTarget.value.targetProjectId)
    const targetPageId = computed(() => refTarget.value.pageId)

    const scopedLoader = computed<ConfigLoader | null>(() => {
      const scopedTenantId = tenantId.value
      const scopedProjectId = targetProjectId.value
      if (scopedTenantId === null || scopedProjectId === null) return null

      const baseClient = props.configLoader.getHttpClient?.() ?? createRequest()
      const scopedClient = createScopedHttpClient(baseClient, {
        'X-Tenant-Id': scopedTenantId,
        'X-Project-Id': scopedProjectId,
      }, scopedTenantId, hostProjectId.value, scopedProjectId)

      return new CrossProjectPageConfigLoader(
        scopedClient,
        `/tenants/${encodeURIComponent(scopedTenantId)}/projects/${encodeURIComponent(scopedProjectId)}/pages-config`,
      )
    })

    const errorMessage = computed(() => {
      if (tenantId.value === null) return '缺少 tenantId，无法解析引用页面'
      if (targetProjectId.value === null) return '缺少目标项目 ID，无法解析引用页面'
      if (targetPageId.value === null) return '缺少目标页面 ID，无法解析引用页面'
      return null
    })

    function logInitError(message: string): void {
      const target = refTarget.value
      const logKey = JSON.stringify({
        route: routePath.value,
        hostRefNodeId: target.hostRefNodeId,
        refProjectId: target.targetProjectId,
        refPath: target.refPath,
        pageId: target.pageId,
        message,
      })
      if (logKey === lastLoggedErrorKey) return

      lastLoggedErrorKey = logKey
      logger.error('跨项目引用页初始化失败', {
        route: routePath.value,
        tenantId: tenantId.value,
        hostRefNodeId: target.hostRefNodeId,
        refProjectId: target.targetProjectId,
        refPath: target.refPath,
        pageId: target.pageId,
        message,
      })
    }

    return () => {
      if (errorMessage.value !== null || scopedLoader.value === null || targetPageId.value === null) {
        const message = errorMessage.value ?? '引用页面加载器初始化失败'
        logInitError(message)
        return h('div', { class: 'spark-cross-project-ref-error' }, message)
      }

      return h(SparkPageRenderer, {
        ref: pageRendererRef,
        key: `${targetProjectId.value}:${targetPageId.value}`,
        pageId: targetPageId.value,
        configLoader: scopedLoader.value,
      })
    }
  },
})
