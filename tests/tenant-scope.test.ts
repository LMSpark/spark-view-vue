import { describe, expect, it } from 'vitest'
import {
  buildTenantPath,
  buildTenantRootPath,
  isTenantScopedPath,
  normalizeRouteSubPath,
  parseTenantScope,
  stripTenantScope,
} from '@/services/tenant-scope'

describe('tenant-scope helpers', () => {
  const scope = { tenantId: 'acme', projectId: 'homepage' }

  it('parses valid tenant scoped paths', () => {
    expect(parseTenantScope('/t/acme/homepage/dev')).toEqual(scope)
    expect(parseTenantScope('/t/acme/homepage')).toEqual(scope)
    expect(parseTenantScope('/about')).toBeNull()
    expect(parseTenantScope('/t/acme')).toBeNull()
  })

  it('detects tenant scoped paths without accepting partial scopes', () => {
    expect(isTenantScopedPath('/t/acme/homepage/settings')).toBe(true)
    expect(isTenantScopedPath('/t/acme')).toBe(false)
    expect(isTenantScopedPath('/tenant/acme/homepage')).toBe(false)
  })

  it('normalizes route sub paths', () => {
    expect(normalizeRouteSubPath('dev')).toBe('/dev')
    expect(normalizeRouteSubPath(' /dev ')).toBe('/dev')
    expect(normalizeRouteSubPath('')).toBe('/')
  })

  it('builds tenant paths and preserves already scoped paths', () => {
    expect(buildTenantRootPath(scope)).toBe('/t/acme/homepage')
    expect(buildTenantPath(scope, 'dev')).toBe('/t/acme/homepage/dev')
    expect(buildTenantPath(scope, '/dev')).toBe('/t/acme/homepage/dev')
    expect(buildTenantPath(scope, '/t/acme/analytics/dev')).toBe('/t/acme/analytics/dev')
    expect(buildTenantPath(scope, '')).toBe('/t/acme/homepage/')
  })

  it('strips a tenant scope prefix while preserving the remaining route', () => {
    expect(stripTenantScope('/t/acme/homepage/dev')).toBe('/dev')
    expect(stripTenantScope('/t/acme/homepage')).toBe('')
    expect(stripTenantScope('/about')).toBe('/about')
  })
})
