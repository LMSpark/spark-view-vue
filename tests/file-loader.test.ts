/**
 * FileLoader 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFileLoader, FileLoader } from '@spark-view/spark-utils'
import axios from 'axios'

// Mock axios.create
vi.mock('axios', async () => {
  const actualAxios = await vi.importActual<any>('axios')
  return {
    ...actualAxios,
    default: {
      ...actualAxios.default,
      create: vi.fn()
    }
  }
})

describe('FileLoader', () => {
  let loader: FileLoader
  let mockAxiosInstance: any
  
  beforeEach(() => {
    // 清理所有缓存
    localStorage.clear()
    sessionStorage.clear()
    
    // 创建mock axios实例
    mockAxiosInstance = {
      request: vi.fn(),
      defaults: {
        responseType: 'json',
        timeout: 5000
      },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }
    
    // 设置mock返回值
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance)
    
    // 创建测试加载器
    loader = createFileLoader({
      baseUrl: '/api/config',
      storage: 'memory',  // 使用内存存储，避免污染 localStorage
      timeout: 5000
    })
  })
  
  describe('基本加载功能', () => {
    it('应该能够加载文件（首次加载）', async () => {
      // 设置mock响应
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'test.json', method: 'GET' }
      })
      
      const result = await loader.load('test.json')
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ test: 'data' })
      expect(result.timestamp).toBe('2024-02-11T10:00:00Z')
      expect(result.fromCache).toBe(false)
      
      // 验证request被调用
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'test.json',
          method: 'GET',
        })
      )
    })
    
    it('应该解析 JSON 文件', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: '{"name": "test", "value": 123}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      const result = await loader.load('test.json', { parseJSON: true })
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'test', value: 123 })
    })
    
    it('应该加载文本文件（不解析 JSON）', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: 'function test() { return 42; }',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      const result = await loader.load<string>('script.js', { parseJSON: false })
      
      expect(result.success).toBe(true)
      expect(result.data).toBe('function test() { return 42; }')
    })
  })
  
  describe('缓存机制', () => {
    it('应该缓存加载的文件', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: '{"cached": true}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      // 首次加载
      await loader.load('cache-test.json')
      
      // 检查缓存
      expect(loader.hasCache('cache-test.json')).toBe(true)
      expect(loader.getCachedTimestamp('cache-test.json')).toBe('2024-02-11T10:00:00Z')
    })
    
    it('应该在文件未修改时使用缓存（notModified 标志）', async () => {
      // 首次加载
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await loader.load('version.json')
      
      // 再次加载，服务器返回 notModified=true
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          notModified: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      const result = await loader.load('version.json')
      
      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.notModified).toBe(true)
    })
    
    it('应该在强制刷新时忽略缓存', async () => {
      // 首次加载
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await loader.load('refresh.json')
      
      // 强制刷新
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          content: '{"version": 2}',
          timestamp: '2024-02-11T11:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      const result = await loader.load('refresh.json', { forceRefresh: true })
      
      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(false)
      expect(result.data).toEqual({ version: 2 })
      expect(result.timestamp).toBe('2024-02-11T11:00:00Z')
    })
  })
  
  describe('自动降级', () => {
    it('应该在网络失败时自动降级到缓存', async () => {
      // 首次加载成功
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          content: '{"data": "cached"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await loader.load('fallback.json')
      
      // 网络失败
      mockAxiosInstance.request.mockRejectedValueOnce(new Error('Network error'))
      
      const result = await loader.load('fallback.json')
      
      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.data).toEqual({ data: 'cached' })
      expect(result.error).toContain('Network error')
    })
    
    it('应该在无缓存时返回失败', async () => {
      mockAxiosInstance.request.mockRejectedValue(new Error('Network error'))
      
      const result = await loader.load('no-cache.json')
      
      expect(result.success).toBe(false)
      expect(result.fromCache).toBe(false)
      expect(result.error).toContain('Network error')
    })
    
    it('应该支持禁用自动降级', async () => {
      const strictLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'memory',
        fallbackToCache: false
      })
      
      // 首次加载成功
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          content: '{"data": "test"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await strictLoader.load('strict.json')
      
      // 网络失败，不使用缓存
      mockAxiosInstance.request.mockRejectedValueOnce(new Error('Network error'))
      
      const result = await strictLoader.load('strict.json')
      
      expect(result.success).toBe(false)
      expect(result.fromCache).toBe(false)
    })
  })
  
  describe('批量加载', () => {
    it('应该并行加载多个文件', async () => {
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: {
            content: '{"file": "1"}',
            timestamp: '2024-02-11T10:00:00Z'
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: {
            content: '{"file": "2"}',
            timestamp: '2024-02-11T10:00:00Z'
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: {
            content: '{"file": "3"}',
            timestamp: '2024-02-11T10:00:00Z'
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
      
      const results = await loader.loadBatch([
        'file1.json',
        'file2.json',
        'file3.json'
      ])
      
      expect(results.size).toBe(3)
      expect(results.get('file1.json')?.success).toBe(true)
      expect(results.get('file2.json')?.success).toBe(true)
      expect(results.get('file3.json')?.success).toBe(true)
    })
  })
  
  describe('缓存管理', () => {
    it('应该清除特定文件缓存', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await loader.load('clear-test.json')
      expect(loader.hasCache('clear-test.json')).toBe(true)
      
      loader.clearCache('clear-test.json')
      expect(loader.hasCache('clear-test.json')).toBe(false)
    })
    
    it('应该清除所有缓存', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await loader.load('file1.json')
      await loader.load('file2.json')
      
      loader.clearCache()
      expect(loader.hasCache('file1.json')).toBe(false)
      expect(loader.hasCache('file2.json')).toBe(false)
    })
    
    it('应该返回缓存统计信息', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      await loader.load('stats1.json')
      await loader.load('stats2.json')
      
      // 验证缓存存在
      expect(loader.hasCache('stats1.json')).toBe(true)
      expect(loader.hasCache('stats2.json')).toBe(true)
      expect(loader.getCachedTimestamp('stats1.json')).toBe('2024-02-11T10:00:00Z')
      expect(loader.getCachedTimestamp('stats2.json')).toBe('2024-02-11T10:00:00Z')
    })
  })
  
  describe('错误处理', () => {
    it('应该处理 HTTP 错误', async () => {
      const error = Object.assign(
        new Error('Request failed with status code 404'),
        {
          response: {
            status: 404,
            statusText: 'Not Found',
            data: {}
          }
        }
      )
      mockAxiosInstance.request.mockRejectedValue(error)
      
      const result = await loader.load('not-found.json')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
    
    it('应该处理无效的响应格式', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          // 缺少 content 或 timestamp
          invalid: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      const result = await loader.load('invalid.json')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('响应格式错误')
    })
    
    it('应该处理 JSON 解析错误', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          content: 'invalid json {',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })
      
      const result = await loader.load('parse-error.json')
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // withTransform / load({ transform }) — 变换缓存
  // ────────────────────────────────────────────────────────────────

  describe('load() 内联 transform', () => {
    it('transform 正常执行并返回变换结果', async () => {
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: { content: '{"value":1}', timestamp: 'ts-1' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const toUpper = (raw: string) => raw.toUpperCase()
      const result = await loader.load<string>('t.json', { transform: toUpper, parseJSON: false })

      expect(result.success).toBe(true)
      expect(result.data).toBe('{"VALUE":1}')
      expect(result.fromCache).toBe(false)
    })

    it('相同 timestamp → 第二次命中变换缓存，不再调用 transform', async () => {
      // 首次：HTTP 请求
      mockAxiosInstance.request.mockResolvedValue({
        data: { content: '{"x":42}', timestamp: 'ts-same' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      let callCount = 0
      function countedTransform(raw: string): string {
        callCount++
        return raw + '-transformed'
      }

      await loader.load<string>('cached-transform.json', {
        transform: countedTransform,
        parseJSON: false
      })

      // 第二次请求返回 notModified（timestamp 不变）
      mockAxiosInstance.request.mockResolvedValue({
        data: { notModified: true },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const result2 = await loader.load<string>('cached-transform.json', {
        transform: countedTransform,
        parseJSON: false
      })

      expect(result2.success).toBe(true)
      expect(result2.fromCache).toBe(true)
      expect(callCount).toBe(1) // transform 只执行一次
    })

    it('forceRefresh 跳过变换缓存，重新执行 transform', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { content: '{"n":1}', timestamp: 'ts-x' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      let callCount = 0
      const fn = (raw: string) => { callCount++; return raw }

      await loader.load<string>('force.json', { transform: fn, parseJSON: false })
      expect(callCount).toBe(1)

      mockAxiosInstance.request.mockResolvedValue({
        data: { content: '{"n":2}', timestamp: 'ts-x' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      await loader.load<string>('force.json', {
        transform: fn,
        parseJSON: false,
        forceRefresh: true
      })
      expect(callCount).toBe(2)
    })

    it('transform 抛出异常时返回 success: false', async () => {
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: { content: '{}', timestamp: 'ts-err' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const brokenFn = (_raw: string) => { throw new Error('解析崩了') }
      const result = await loader.load<string>('err.json', { transform: brokenFn })

      expect(result.success).toBe(false)
      expect(result.error).toContain('transform 失败')
      expect(result.error).toContain('解析崩了')
    })
  })

  describe('withTransform() 子加载器', () => {
    it('子加载器 .load() 返回变换结果', async () => {
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: { content: '[1,2,3]', timestamp: 'ts-w1' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      function parseNumbers(raw: string): number[] {
        return JSON.parse(raw) as number[]
      }

      const numLoader = loader.withTransform(parseNumbers)
      const result = await numLoader.load('nums.json')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([1, 2, 3])
    })

    it('子加载器 .loadBatch() 返回 Map', async () => {
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: { content: '[1]', timestamp: 'ts-b1' },
          status: 200, statusText: 'OK', headers: {}, config: {}
        })
        .mockResolvedValueOnce({
          data: { content: '[2,3]', timestamp: 'ts-b2' },
          status: 200, statusText: 'OK', headers: {}, config: {}
        })

      const numLoader = loader.withTransform((raw: string) => JSON.parse(raw) as number[])
      const map = await numLoader.loadBatch(['a.json', 'b.json'])

      expect(map.size).toBe(2)
      expect(map.get('a.json')?.data).toEqual([1])
      expect(map.get('b.json')?.data).toEqual([2, 3])
    })

    it('不同 transform key 互不污染缓存', async () => {
      const baseContent = '{"v":1}'
      mockAxiosInstance.request.mockResolvedValue({
        data: { content: baseContent, timestamp: 'ts-key' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const loaderA = loader.withTransform((r) => r + '-A', 'keyA')
      const loaderB = loader.withTransform((r) => r + '-B', 'keyB')

      const ra = await loaderA.load('shared.json')
      const rb = await loaderB.load('shared.json')

      expect(ra.data).toBe(baseContent + '-A')
      expect(rb.data).toBe(baseContent + '-B')
    })
  })

  describe('store() / retrieve() 高级 API', () => {
    it('store 后 retrieve 命中（timestamp 匹配）', () => {
      loader.store('my-key', { computed: true }, 'ts-store')
      const result = loader.retrieve<{ computed: boolean }>('my-key', 'ts-store')
      expect(result).toEqual({ computed: true })
    })

    it('timestamp 不匹配时 retrieve 返回 null', () => {
      loader.store('stale-key', { old: true }, 'ts-old')
      const result = loader.retrieve('stale-key', 'ts-new')
      expect(result).toBeNull()
    })

    it('key 不存在时 retrieve 返回 null', () => {
      expect(loader.retrieve('nonexistent', 'ts-any')).toBeNull()
    })
  })
})
