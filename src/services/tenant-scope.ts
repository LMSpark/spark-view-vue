export interface TenantProjectScope {
  tenantId: string
  projectId: string
}

const TENANT_SCOPE_PREFIX_RE = /^\/t\/([^/]+)\/([^/]+)(?:\/|$)/
const TENANT_SCOPE_STRIP_RE = /^\/t\/[^/]+\/[^/]+/

export function parseTenantScope(path: string): TenantProjectScope | null {
  const match = TENANT_SCOPE_PREFIX_RE.exec(path)
  if (!match?.[1] || !match[2]) return null
  return {
    tenantId: match[1],
    projectId: match[2],
  }
}

export function isTenantScopedPath(path: string): boolean {
  return parseTenantScope(path) !== null
}

export function normalizeRouteSubPath(path: string): string {
  const trimmed = path.trim()
  if (trimmed.length === 0) return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function stripTenantScope(path: string): string {
  return path.replace(TENANT_SCOPE_STRIP_RE, '') || ''
}

export function buildTenantRootPath(scope: TenantProjectScope): string {
  return `/t/${scope.tenantId}/${scope.projectId}`
}

export function buildTenantPath(scope: TenantProjectScope, subPath: string): string {
  const normalized = normalizeRouteSubPath(subPath)
  if (isTenantScopedPath(normalized)) return normalized
  return `${buildTenantRootPath(scope)}${normalized}`
}
