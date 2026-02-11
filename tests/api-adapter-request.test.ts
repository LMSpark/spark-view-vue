/**
 * ApiAdapter 集成测试
 * 测试 ApiAdapter 与 Request 类的集成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiAdapter } from '../packages/spark-data/src/apiAdapter'
import type { IApiContext } from '../packages/spark-data/src/apiAdapter'
import type { HttpEndpoint } from '../packages/spark-data/src/types'

// Mock fetch
global.fetch = vi.fn()

describe('ApiAdapter with Request', () => {
  let adapter: ApiAdapter
  let apiContext: IApiContext

  beforeEach(() => {
    apiContext = {
      baseURL: '/api',
      token: 'test-token',
      tenantId: 'test-tenant',
      timeout: 5000
    }
    
    adapter = new ApiAdapter(apiContext)
    
    // Reset fetch mock
    vi.mocked(fetch).mockReset()
  })

  it('应该正确创建 ApiAdapter', () => {
    expect(adapter).toBeDefined()
  })

  it('应该构建正确的请求URL', () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }
    
    const config = adapter.buildRequest(endpoint)
    
    expect(config.url).toContain('/api/users')
    expect(config.method).toBe('GET')
  })

  it('应该处理路径参数', () => {
    const endpoint: HttpEndpoint = {
      url: '/users/{id}',
      method: 'GET',
      pathParams: ['id']
    }
    
    const config = adapter.buildRequest(endpoint, { id: 123 })
    
    expect(config.url).toContain('/api/users/123')
  })

  it('应该在请求头中添加认证信息', () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }
    
    const config = adapter.buildRequest(endpoint)
    
    expect(config.headers?.Authorization).toBe('Bearer test-token')
  })

  it('应该在请求头中添加租户ID', () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }
    
    const config = adapter.buildRequest(endpoint)
    
    expect(config.headers?.['X-Tenant-Id']).toBe('test-tenant')
  })

  it('应该正确构建 POST 请求体', () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'POST'
    }
    
    const params = {
      name: 'John',
      email: 'john@example.com'
    }
    
    const config = adapter.buildRequest(endpoint, params)
    
    expect(config.method).toBe('POST')
    expect(config.data).toEqual(params)
  })

  it('应该支持 GET 请求的查询参数', () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }
    
    const params = {
      page: 1,
      pageSize: 10
    }
    
    const config = adapter.buildRequest(endpoint, params)
    
    expect(config.url).toContain('page=1')
    expect(config.url).toContain('pageSize=10')
  })

  it('应该支持更新上下文', () => {
    const newToken = 'new-token'
    adapter.updateContext({ token: newToken })
    
    const context = adapter.getContext()
    expect(context.token).toBe(newToken)
  })

  it('应该正确合并自定义请求头', () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET',
      headers: {
        'X-Custom-Header': 'custom-value'
      }
    }
    
    const config = adapter.buildRequest(endpoint)
    
    expect(config.headers?.['X-Custom-Header']).toBe('custom-value')
    expect(config.headers?.Authorization).toBe('Bearer test-token')
  })

  it('应该处理没有 Bearer 前缀的 token', () => {
    // 测试 token 自动添加 Bearer 前缀
    const adapterNoBearerToken = new ApiAdapter({
      baseURL: '/api',
      token: 'plain-token'
    })
    
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }
    
    const config = adapterNoBearerToken.buildRequest(endpoint)
    
    expect(config.headers?.Authorization).toBe('Bearer plain-token')
  })

  it('应该保留已有 Bearer 前缀的 token', () => {
    const adapterWithBearer = new ApiAdapter({
      baseURL: '/api',
      token: 'Bearer existing-token'
    })
    
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }
    
    const config = adapterWithBearer.buildRequest(endpoint)
    
    expect(config.headers?.Authorization).toBe('Bearer existing-token')
  })
})
