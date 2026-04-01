const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:/i
const PLATFORM_SCOPED_RESOURCE_RE = /^\/(?:api\/)?(?:navigation|data|pages-config)(?:\/|$)/
const SCOPED_PREFIX_RE = /^\/(?:api\/)?tenants\/[^/]+\/projects\/[^/]+(?:\/|$)/

function pickFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstString(item)
      if (picked !== undefined) return picked
    }
  }

  return undefined
}

/**
 * 平台资源路径（/navigation、/data、/pages-config）自动补项目作用域前缀。
 *
 * 规则：
 * - 已经是 /tenants/.../projects/... 或 /api/tenants/.../projects/... 的 URL 原样返回
 * - 仅对平台内置资源族生效，避免误伤普通 /api/users 之类业务接口
 * - 缺少 tenantId/projectId 时直接 fail-fast
 */
export function applyPlatformProjectScope(
  rawUrl: string,
  context: Record<string, unknown> = {}
): string {
  if (rawUrl.trim() === '' || ABSOLUTE_URL_RE.test(rawUrl)) return rawUrl

  const normalized = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`
  if (!PLATFORM_SCOPED_RESOURCE_RE.test(normalized)) return rawUrl
  if (SCOPED_PREFIX_RE.test(normalized)) return normalized

  const tenantId = pickFirstString(context['tenantId'])
  const projectId = pickFirstString(context['projectId'])

  if (tenantId === undefined || projectId === undefined) {
    throw new Error(`Missing tenantId/projectId for platform scoped URL: ${rawUrl}`)
  }

  const scopePrefix = `/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}`
  return normalized.startsWith('/api/')
    ? `/api${scopePrefix}${normalized.slice(4)}`
    : `${scopePrefix}${normalized}`
}