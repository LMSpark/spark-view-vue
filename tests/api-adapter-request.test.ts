/**
 * Request.executeEndpoint 集成测试
 * 测试 Request 类的 executeEndpoint 方法与 HttpEndpoint 的集成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequest, type Request } from '../packages/spark-utils/src/Request'
import type { HttpEndpoint } from '../packages/spark-data/src/types'
import axios from 'axios'

// Mock axios
vi.mock('axios', async () => {
  const actualAxios = await vi.importActual<typeof import('axios')>('axios')
  return {
    ...actualAxios,
    default: {
      ...actualAxios.default,
      create: vi.fn(),
      isAxiosError: actualAxios.default.isAxiosError
    }
  }
})

describe('Request.executeEndpoint', () => {
  let request: Request
  let mockAxiosInstance: any

  beforeEach(() => {
    // 创建 mock axios 实例
    mockAxiosInstance = {
      request: vi.fn(),
      defaults: { responseType: 'json' },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }
    
    // 设置 mock 返回值
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance)
    
    // 创建 Request 实例
    request = createRequest({
      baseURL: '/api',
      token: 'test-token',
      tenantId: 'test-tenant',
      timeout: 5000
    })
  })

  it('应该正确创建 Request 实例', () => {
    expect(request).toBeDefined()
  })

  it('应该正确处理路径参数替换', async () => {
    const endpoint: HttpEndpoint = {
      url: '/users/{userId}',
      method: 'GET',
      pathParams: ['userId']
    }

    mockAxiosInstance.request.mockResolvedValue({
      data: { id: 123, name: 'Test User' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    })

    const result = await request.executeEndpoint(endpoint, { userId: 123 })

    expect(mockAxiosInstance.request).toHaveBeenCalledWith({
      url: '/users/123',
      method: 'GET',
      params: {},
      timeout: 5000,
      responseType: 'json'
    })
    expect(result).toEqual({ id: 123, name: 'Test User' })
  })

  it('应该正确处理查询参数', async () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET'
    }

    mockAxiosInstance.request.mockResolvedValue({
      data: [{ id: 1, name: 'User 1' }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    })

    const result = await request.executeEndpoint(endpoint, { page: 1, limit: 10 })

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/users',
        method: 'GET',
        params: { page: 1, limit: 10 }
      })
    )
    expect(result).toEqual([{ id: 1, name: 'User 1' }])
  })

  it('应该正确处理 POST 请求体', async () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'POST'
    }

    mockAxiosInstance.request.mockResolvedValue({
      data: { id: 123, name: 'New User' },
      status: 201,
      statusText: 'Created',
      headers: {},
      config: {}
    })

    const userData = { name: 'New User', email: 'user@example.com' }
    const result = await request.executeEndpoint(endpoint, userData)

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/users',
        method: 'POST',
        data: userData
      })
    )
    expect(result).toEqual({ id: 123, name: 'New User' })
  })

  it('应该正确处理端点定义的查询参数', async () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET',
      params: { status: 'active' }
    }

    mockAxiosInstance.request.mockResolvedValue({
      data: [{ id: 1, name: 'Active User' }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    })

    const result = await request.executeEndpoint(endpoint, { page: 1 })

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/users',
        method: 'GET',
        params: { status: 'active', page: 1 }
      })
    )
    expect(result).toEqual([{ id: 1, name: 'Active User' }])
  })

  it('应该正确处理端点定义的请求头', async () => {
    const endpoint: HttpEndpoint = {
      url: '/users',
      method: 'GET',
      headers: { 'X-Custom': 'test' }
    }

    mockAxiosInstance.request.mockResolvedValue({
      data: [{ id: 1 }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    })

    await request.executeEndpoint(endpoint)

    // 验证端点定义的 headers 被正确传递
    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/users',
        method: 'GET',
        headers: { 'X-Custom': 'test' }
      })
    )
  })
})
