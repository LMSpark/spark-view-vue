import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuth, isAuthenticated } from '../src/services/auth'

function setToken(token: string): void {
  localStorage.setItem('spark_token', token)
}

function setUser(user: Record<string, unknown>): void {
  localStorage.setItem('spark_user', JSON.stringify(user))
}

describe('auth.isAuthenticated guard', () => {
  beforeEach(() => {
    clearAuth()
  })

  it('returns false when only token exists', () => {
    setToken('stale-token')
    expect(isAuthenticated()).toBe(false)
  })

  it('returns false when user exists but tenant/project are missing', () => {
    setToken('valid-token')
    setUser({
      userId: 'u1',
      username: 'demo',
      displayName: 'Demo',
      email: 'demo@test.com',
      avatar: '',
      roles: [],
      tenantId: '',
      defaultProjectId: '',
    })
    expect(isAuthenticated()).toBe(false)
  })

  it('returns true when token and user scope are complete', () => {
    setToken('valid-token')
    setUser({
      userId: 'u1',
      username: 'demo',
      displayName: 'Demo',
      email: 'demo@test.com',
      avatar: '',
      roles: ['user'],
      tenantId: 'tenant-a',
      defaultProjectId: 'homepage',
    })
    expect(isAuthenticated()).toBe(true)
  })
})
