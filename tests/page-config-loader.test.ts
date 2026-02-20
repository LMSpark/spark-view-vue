/**
 * PageConfigLoader 单元测试
 *
 * 策略：
 * - createFileLoader 被 mock，直接控制 fileLoader.load() 返回值
 * - globalThis.fetch 通过 vi.stubGlobal 模拟远程调用
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FileLoadResult } from '@spark-view/spark-utils'
import { PageConfigLoader } from '@spark-view/spark-page-config'

// ── Mock FileLoader ──────────────────────────────────────────────────────────

const mockFileLoader = {
  load: vi.fn(),
  loadBatch: vi.fn(),
  clearCache: vi.fn(),
  hasCache: vi.fn(),
  getCachedTimestamp: vi.fn(),
  store: vi.fn(),
  retrieve: vi.fn(),
  withTransform: vi.fn()
}

vi.mock('@spark-view/spark-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-utils')>()
  return {
    ...actual,
    createFileLoader: vi.fn(() => mockFileLoader)
  }
})

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function fileOk<T>(data: T, fromCache = false): FileLoadResult<T> {
  return { success: true, data, timestamp: 'ts-1', fromCache }
}

function fileFail(error: string): FileLoadResult<never> {
  return { success: false, error, fromCache: false }
}

function mockFetch(status: number, body: unknown, asText = false): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(asText ? String(body) : JSON.stringify(body))
  }))
}

// ── 测试 ──────────────────────────────────────────────────────────────────────

describe('PageConfigLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  // ─────────────────────────────────────────────────────────────────
  // source: 'local'（使用 FileLoader）
  // ─────────────────────────────────────────────────────────────────

  describe("source: 'local'", () => {
    let loader: PageConfigLoader

    beforeEach(() => {
      loader = new PageConfigLoader({ source: 'local' })
    })

    it('loadRoutes: FileLoader 成功', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk([{ path: '/home', name: 'home', pageId: 'home' }]))
      const r = await loader.loadRoutes()
      expect(r.success).toBe(true)
      expect(r.source).toBe('local')
      expect(r.data).toHaveLength(1)
      expect(mockFileLoader.load).toHaveBeenCalledWith('/routes.json')
    })

    it('loadRoutes: FileLoader 失败 → success:false', async () => {
      mockFileLoader.load.mockResolvedValue(fileFail('文件不存在'))
      const r = await loader.loadRoutes()
      expect(r.success).toBe(false)
      expect(r.error).toContain('文件不存在')
    })

    it('loadRule: 成功返回规则数组', async () => {
      const rules = [{ type: 'div', props: { id: 'root' } }]
      mockFileLoader.load.mockResolvedValue(fileOk(rules))
      const r = await loader.loadRule('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toEqual(rules)
      expect(mockFileLoader.load).toHaveBeenCalledWith('/order-page/rule.json')
    })

    it('loadPageData: 成功返回页面数据', async () => {
      const data = { title: '订单页', list: [] }
      mockFileLoader.load.mockResolvedValue(fileOk(data))
      const r = await loader.loadPageData('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toEqual(data)
      expect(mockFileLoader.load).toHaveBeenCalledWith('/order-page/pagedata.json')
    })

    it('loadScript: 有脚本文件', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk('function onLoad() {}'))
      const r = await loader.loadScript('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('function onLoad() {}')
      expect(mockFileLoader.load).toHaveBeenCalledWith(
        '/order-page/script.js',
        { parseJSON: false }
      )
    })

    it('loadScript: 无脚本文件 → 返回空字符串（非失败）', async () => {
      mockFileLoader.load.mockResolvedValue(fileFail('Not found'))
      const r = await loader.loadScript('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('')
    })

    it('loadPageConfig: 全部成功 → 组合 PageConfig', async () => {
      const rules = [{ type: 'div' }]
      const data = { title: '订单' }
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk(rules))       // rule.json
        .mockResolvedValueOnce(fileOk(data))         // pagedata.json
        .mockResolvedValueOnce(fileOk('// script')) // script.js
      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(true)
      expect(r.data?.pageId).toBe('order-page')
      expect(r.data?.rule).toEqual(rules)
      expect(r.data?.data).toEqual(data)
      expect(r.data?.script).toBe('// script')
    })

    it('loadPageConfig: rule 失败 → 快速返回 false', async () => {
      mockFileLoader.load
        .mockResolvedValueOnce(fileFail('rule missing')) // rule.json
        .mockResolvedValueOnce(fileOk({}))               // pagedata.json
        .mockResolvedValueOnce(fileFail('no script'))    // script.js
      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(false)
      expect(r.error).toContain('rule missing')
    })

    it('loadPageConfig: data 失败 → 快速返回 false', async () => {
      const rules = [{ type: 'div' }]
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk(rules))
        .mockResolvedValueOnce(fileFail('data missing'))
        .mockResolvedValueOnce(fileOk(''))
      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(false)
      expect(r.error).toContain('data missing')
    })

    it('loadPageConfig: script 失败 → 仍然成功（空脚本）', async () => {
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk([{ type: 'div' }]))
        .mockResolvedValueOnce(fileOk({ x: 1 }))
        .mockResolvedValueOnce(fileFail('no script'))
      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(true)
      expect(r.data?.script).toBe('')
    })

    it('clearCache: 委托给 fileLoader.clearCache', () => {
      loader.clearCache('/order-page/rule.json')
      expect(mockFileLoader.clearCache).toHaveBeenCalledWith('/order-page/rule.json')
    })

    it('clearCache: 无参数 → 清全部', () => {
      loader.clearCache()
      expect(mockFileLoader.clearCache).toHaveBeenCalledWith(undefined)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // source: 'remote'（使用 globalThis.fetch）
  // ─────────────────────────────────────────────────────────────────

  describe("source: 'remote'", () => {
    let loader: PageConfigLoader

    beforeEach(() => {
      loader = new PageConfigLoader({ source: 'remote', apiBaseUrl: '/api' })
    })

    it('loadRoutes: 裸对象响应', async () => {
      const routes = [{ path: '/', name: 'home', pageId: 'home' }]
      mockFetch(200, routes)
      const r = await loader.loadRoutes()
      expect(r.success).toBe(true)
      expect(r.source).toBe('remote')
      expect(r.data).toEqual(routes)
    })

    it('loadRoutes: 标准 API 封装 { code:200, data }', async () => {
      const routes = [{ path: '/', name: 'home', pageId: 'home' }]
      mockFetch(200, { code: 200, data: routes, message: 'ok' })
      const r = await loader.loadRoutes()
      expect(r.success).toBe(true)
      expect(r.data).toEqual(routes)
    })

    it('loadRoutes: API 返回错误码 { code:500, message }', async () => {
      mockFetch(200, { code: 500, message: '服务器错误' })
      await expect(loader.loadRoutes()).rejects.toThrow('服务器错误')
    })

    it('loadRoutes: HTTP 4xx → throws（remote 模式不捕获）', async () => {
      mockFetch(404, {})
      await expect(loader.loadRoutes()).rejects.toThrow('HTTP 404')
    })

    it('loadScript: 远程 fetch 文本文件', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('function onLoad() { return 1 }')
      }))
      const r = await loader.loadScript('my-page')
      expect(r.success).toBe(true)
      expect(r.data).toContain('onLoad')
      expect(r.source).toBe('remote')
    })

    it('loadScript: 远程脚本 404 → 抛出', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      }))
      await expect(loader.loadScript('my-page')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // source: 'hybrid'
  // ─────────────────────────────────────────────────────────────────

  describe("source: 'hybrid'", () => {
    let loader: PageConfigLoader

    beforeEach(() => {
      loader = new PageConfigLoader({ source: 'hybrid', apiBaseUrl: '/api' })
    })

    it('远程成功 → 返回远程数据', async () => {
      const routes = [{ path: '/', name: 'home', pageId: 'home' }]
      mockFetch(200, routes)
      const r = await loader.loadRoutes()
      expect(r.success).toBe(true)
      expect(r.source).toBe('remote')
      expect(mockFileLoader.load).not.toHaveBeenCalled()
    })

    it('远程失败 → 降级到本地', async () => {
      // Remote throws
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
      // Local succeeds
      const routes = [{ path: '/fallback', name: 'fallback', pageId: 'fb' }]
      mockFileLoader.load.mockResolvedValue(fileOk(routes))

      const r = await loader.loadRoutes()
      expect(r.success).toBe(true)
      expect(r.source).toBe('local')
      expect(r.data).toEqual(routes)
    })

    it('远程 + 本地 均失败 → success:false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      mockFileLoader.load.mockResolvedValue(fileFail('文件不存在'))

      const r = await loader.loadRoutes()
      expect(r.success).toBe(false)
    })

    it('hybrid loadScript: 远程失败 → 降级本地', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no script remote')))
      mockFileLoader.load.mockResolvedValue(fileOk('// local script'))

      const r = await loader.loadScript('some-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('// local script')
    })
  })

})

