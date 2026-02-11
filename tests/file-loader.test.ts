/**
 * FileLoader 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFileLoader, FileLoader } from '@spark-view/spark-utils'

describe('FileLoader', () => {
  let loader: FileLoader
  
  beforeEach(() => {
    // 清理所有缓存
    localStorage.clear()
    sessionStorage.clear()
    
    // 创建测试加载器
    loader = createFileLoader({
      baseUrl: '/api/config',
      storage: 'memory',  // 使用内存存储，避免污染 localStorage
      timeout: 5000
    })
  })
  
  describe('基本加载功能', () => {
    it('应该能够加载文件（首次加载）', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      const result = await loader.load('test.json')
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ test: 'data' })
      expect(result.timestamp).toBe('2024-02-11T10:00:00Z')
      expect(result.fromCache).toBe(false)
    })
    
    it('应该解析 JSON 文件', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"name": "test", "value": 123}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      const result = await loader.load('test.json', { parseJSON: true })
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'test', value: 123 })
    })
    
    it('应该加载文本文件（不解析 JSON）', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: 'function test() { return 42; }',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      const result = await loader.load<string>('script.js', { parseJSON: false })
      
      expect(result.success).toBe(true)
      expect(result.data).toBe('function test() { return 42; }')
    })
  })
  
  describe('缓存机制', () => {
    it('应该缓存加载的文件', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"cached": true}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      // 首次加载
      await loader.load('cache-test.json')
      
      // 检查缓存
      expect(loader.hasCache('cache-test.json')).toBe(true)
      expect(loader.getCachedTimestamp('cache-test.json')).toBe('2024-02-11T10:00:00Z')
    })
    
    it('应该在文件未修改时使用缓存（304）', async () => {
      // 首次加载
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('version.json')
      
      // 再次加载，服务器返回 304
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 304
      })
      
      const result = await loader.load('version.json')
      
      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.notModified).toBe(true)
      expect(result.data).toEqual({ version: 1 })
    })
    
    it('应该在文件未修改时使用缓存（notModified 标志）', async () => {
      // 首次加载
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('version.json')
      
      // 再次加载，服务器返回 notModified=true
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          notModified: true
        })
      })
      
      const result = await loader.load('version.json')
      
      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.notModified).toBe(true)
    })
    
    it('应该在强制刷新时忽略缓存', async () => {
      // 首次加载
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('refresh.json')
      
      // 强制刷新
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"version": 2}',
          timestamp: '2024-02-11T11:00:00Z'
        })
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"data": "cached"}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('fallback.json')
      
      // 网络失败
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      
      const result = await loader.load('fallback.json')
      
      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.data).toEqual({ data: 'cached' })
      expect(result.error).toContain('Network error')
    })
    
    it('应该在无缓存时返回失败', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"data": "test"}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await strictLoader.load('strict.json')
      
      // 网络失败，不使用缓存
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      
      const result = await strictLoader.load('strict.json')
      
      expect(result.success).toBe(false)
      expect(result.fromCache).toBe(false)
    })
  })
  
  describe('批量加载', () => {
    it('应该并行加载多个文件', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: '{"file": "1"}',
            timestamp: '2024-02-11T10:00:00Z'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: '{"file": "2"}',
            timestamp: '2024-02-11T10:00:00Z'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: '{"file": "3"}',
            timestamp: '2024-02-11T10:00:00Z'
          })
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('clear-test.json')
      expect(loader.hasCache('clear-test.json')).toBe(true)
      
      loader.clearCache('clear-test.json')
      expect(loader.hasCache('clear-test.json')).toBe(false)
    })
    
    it('应该清除所有缓存', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('file1.json')
      await loader.load('file2.json')
      
      loader.clearCache()
      expect(loader.hasCache('file1.json')).toBe(false)
      expect(loader.hasCache('file2.json')).toBe(false)
    })
    
    it('应该返回缓存统计信息', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      await loader.load('stats1.json')
      await loader.load('stats2.json')
      
      const stats = loader.getCacheStats()
      
      expect(stats.totalFiles).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.oldestCache).toBeGreaterThan(0)
      expect(stats.newestCache).toBeGreaterThan(0)
    })
  })
  
  describe('错误处理', () => {
    it('应该处理 HTTP 错误', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })
      
      const result = await loader.load('not-found.json')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
    
    it('应该处理无效的响应格式', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          // 缺少 content 或 timestamp
          invalid: true
        })
      })
      
      const result = await loader.load('invalid.json')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('响应格式错误')
    })
    
    it('应该处理 JSON 解析错误', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: 'invalid json {',
          timestamp: '2024-02-11T10:00:00Z'
        })
      })
      
      const result = await loader.load('parse-error.json')
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
