/**
 * PageConfigLoader 单元测试
 *
 * 策略：
 * - createFileLoader 被 mock，直接控制 fileLoader.load() 返回值
 * - globalThis.fetch 通过 vi.stubGlobal 模拟远程调用
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FileLoadResult } from '@spark-view/spark-utils'
import { PageConfigLoader, compileRule, normalizeRuleNode, parsePageData, parseScript, parseCss } from '@spark-view/spark-page-config'
import { DataSet } from '@spark-view/spark-data'

// ── Mock FileLoader ──────────────────────────────────────────────────────────

const mockFileLoader = {
  load: vi.fn(),
  loadBatch: vi.fn(),
  on: vi.fn(() => vi.fn()),
  clearCache: vi.fn(),
  hasCache: vi.fn(),
  getCachedTimestamp: vi.fn(),
  store: vi.fn(),
  retrieve: vi.fn(),
  /**
   * withTransform 返回一个 DerivedLoader，其 load() 委托给 mockFileLoader.load。
   * 这样测试中对 mockFileLoader.load.mockResolvedValue() 的设置
   * 对所有三个派生加载器（ruleLoader / dataLoader / scriptLoader）同样生效。
   */
  withTransform: vi.fn().mockImplementation(() => ({
    load: (path: string) => mockFileLoader.load(path),
    loadBatch: vi.fn()
  }))
}

const mockRequestClient = {
  interceptors: {
    request: {
      use: vi.fn(() => vi.fn()),
    },
    response: {
      use: vi.fn(() => vi.fn()),
    },
  },
  request: vi.fn(),
  requestFull: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  clearCache: vi.fn(),
}

vi.mock('@spark-view/spark-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-utils')>()
  return {
    ...actual,
    createFileLoader: vi.fn(() => mockFileLoader),
    createRequest: vi.fn(() => mockRequestClient),
  }
})

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function fileOk<T>(data: T, fromCache = false): FileLoadResult<T> {
  return { success: true, data, timestamp: 'ts-1', fromCache }
}

function fileFail(error: string): FileLoadResult<never> {
  return { success: false, error, fromCache: false }
}

// ── 测试 ──────────────────────────────────────────────────────────────────────

describe('PageConfigLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFileLoader.load.mockReset()
    mockFileLoader.loadBatch.mockReset()
    mockFileLoader.on.mockReset()
    mockFileLoader.on.mockImplementation(() => vi.fn())
    mockRequestClient.request.mockReset()
    mockRequestClient.requestFull.mockReset()
    mockRequestClient.get.mockReset()
    mockRequestClient.post.mockReset()
    mockRequestClient.put.mockReset()
    mockRequestClient.patch.mockReset()
    mockRequestClient.delete.mockReset()
    mockRequestClient.clearCache.mockReset()
    mockRequestClient.interceptors.request.use.mockReset()
    mockRequestClient.interceptors.request.use.mockImplementation(() => vi.fn())
    mockRequestClient.interceptors.response.use.mockReset()
    mockRequestClient.interceptors.response.use.mockImplementation(() => vi.fn())
    // 每次清理后重违 withTransform mock（clearAllMocks 会清除 mockImplementation）
    mockFileLoader.withTransform.mockImplementation(() => ({
      load: (path: string) => mockFileLoader.load(path),
      loadBatch: vi.fn()
    }))
  })

  // ─────────────────────────────────────────────────────────────────
  // source: 'local'（使用 FileLoader）
  // ─────────────────────────────────────────────────────────────────

  describe("source: 'local'", () => {
    let loader: PageConfigLoader

    beforeEach(() => {
      loader = new PageConfigLoader({ source: 'local' })
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
      // scriptLoader.load() 委托给 mockFileLoader.load，仅传路径（parseJSON 由 withTransform 控制）
      expect(mockFileLoader.load).toHaveBeenCalledWith('/order-page/script.js')
    })

    it('loadScript: 无脚本文件 → 返回空字符串（非失败）', async () => {
      mockFileLoader.load.mockResolvedValue(fileFail('Not found'))
      const r = await loader.loadScript('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('')
    })

    it('loadCss: 有样式文件', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk('.root { color: red }'))
      const r = await loader.loadCss('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('.root { color: red }')
      expect(mockFileLoader.load).toHaveBeenCalledWith('/order-page/style.css')
    })

    it('loadCss: 无样式文件 → 返回空字符串（非失败）', async () => {
      mockFileLoader.load.mockResolvedValue(fileFail('Not found'))
      const r = await loader.loadCss('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('')
    })

    it('loadPageConfig: 全部成功 → 组合 PageConfig', async () => {
      const rules = [{ type: 'div' }]
      const data = { title: '订单' }
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk(rules))           // rule.json
        .mockResolvedValueOnce(fileOk(data))             // pagedata.json
        .mockResolvedValueOnce(fileOk('// script'))     // script.js
        .mockResolvedValueOnce(fileOk('.app{}'))         // style.css
      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(true)
      expect(r.data?.pageId).toBe('order-page')
      expect(r.data?.rule).toEqual(rules)
      expect(r.data?.data).toEqual(data)
      expect(r.data?.script).toBe('// script')
      expect(r.data?.css).toBe('.app{}')
    })

    it('loadPageConfig: rule 失败 → 快速返回 false', async () => {
      mockFileLoader.load
        .mockResolvedValueOnce(fileFail('rule missing')) // rule.json
        .mockResolvedValueOnce(fileOk({}))               // pagedata.json
        .mockResolvedValueOnce(fileFail('no script'))    // script.js
        .mockResolvedValueOnce(fileFail('no css'))       // style.css
      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(false)
      expect(r.error).toContain('rule missing')
    })

    it('loadPageConfig: data 失败 → 快速返回 false', async () => {
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/order-page/rule.json') return Promise.resolve(fileOk([{ type: 'div' }]))
        if (path === '/order-page/pagedata.json') return Promise.resolve(fileFail('data missing'))
        if (path === '/order-page/script.js') return Promise.resolve(fileOk(''))
        if (path === '/order-page/style.css') return Promise.resolve(fileOk(''))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(false)
      expect(r.error).toContain('data missing')
    })

    it('loadPageConfig: script 失败 → 仍然成功（空脚本）', async () => {
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/order-page/rule.json') return Promise.resolve(fileOk([{ type: 'div' }]))
        if (path === '/order-page/pagedata.json') return Promise.resolve(fileOk({ x: 1 }))
        if (path === '/order-page/script.js') return Promise.resolve(fileFail('no script'))
        if (path === '/order-page/style.css') return Promise.resolve(fileOk('.app{}'))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(true)
      expect(r.data?.script).toBe('')
    })

    it('loadPageConfig: css 失败 → 仍然成功（空样式）', async () => {
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/order-page/rule.json') return Promise.resolve(fileOk([{ type: 'div' }]))
        if (path === '/order-page/pagedata.json') return Promise.resolve(fileOk({ x: 1 }))
        if (path === '/order-page/script.js') return Promise.resolve(fileOk('// script'))
        if (path === '/order-page/style.css') return Promise.resolve(fileFail('no css file'))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(true)
      expect(r.data?.css).toBe('')
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

    it('loadRule: 远程读取 pages-config 文件接口并编译规则', async () => {
      mockRequestClient.request.mockResolvedValue({
        content: JSON.stringify([{ type: 'div', props: { id: 'remote-root' } }]),
        timestamp: 'ts-1',
      })

      const r = await loader.loadRule('remote-page')
      expect(r.success).toBe(true)
      expect(r.data?.[0]?.type).toBe('div')
      expect(r.data?.[0]?.props).toEqual({ id: 'remote-root' })
      expect(mockRequestClient.request).toHaveBeenCalledWith({
        url: '/pages-config/remote-page/rule.json',
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
    })

    it('loadScript: 远程 fetch 文本文件', async () => {
      mockRequestClient.request.mockResolvedValue({
        content: 'function onLoad() { return 1 }',
        timestamp: 'ts-1',
      })

      const r = await loader.loadScript('my-page')
      expect(r.success).toBe(true)
      expect(r.data).toContain('onLoad')
      expect(r.source).toBe('remote')
      expect(mockRequestClient.request).toHaveBeenCalledWith({
        url: '/pages-config/my-page/script.js',
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
    })

    it('loadScript: 远程脚本 404 → 返回空字符串（可选文件）', async () => {
      mockRequestClient.request.mockRejectedValue({ status: 404 })

      const r = await loader.loadScript('my-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('')
    })

    it('loadCss: 远程 CSS 文本', async () => {
      mockRequestClient.request.mockResolvedValue({
        content: '.app { color: blue }',
        timestamp: 'ts-1',
      })

      const r = await loader.loadCss('my-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('.app { color: blue }')
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

    it('hybrid loadScript: 远程失败 → 降级本地', async () => {
      mockRequestClient.request.mockRejectedValue(new Error('no script remote'))
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/some-page/script.js') return Promise.resolve(fileOk('// local script'))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadScript('some-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('// local script')
    })

    it('hybrid loadCss: 远程失败 → 降级本地', async () => {
      mockRequestClient.request.mockRejectedValue(new Error('no css remote'))
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/some-page/style.css') return Promise.resolve(fileOk('.root{}'))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadCss('some-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('.root{}')
    })
  })

})

// ────────────────────────────────────────────────────────────────────────────
// 编译 transform 函数单元测试（与 PageConfigLoader 解耦）
// ────────────────────────────────────────────────────────────────────────────

describe('compileRule', () => {
  it('解析 JSON 数组并保持结构', () => {
    const raw = JSON.stringify([{ type: 'div', props: { id: 'root' } }])
    const result = compileRule(raw)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('div')
    expect(result[0]!.props).toEqual({ id: 'root' })
  })

  it('单对象自动包装为数组', () => {
    const raw = JSON.stringify({ type: 'el-button', props: { text: 'OK' } })
    const result = compileRule(raw)
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]!.type).toBe('el-button')
  })

  it('type 缺失时默认为 "div"', () => {
    const raw = JSON.stringify([{}])
    expect(compileRule(raw)[0]!.type).toBe('div')
  })

  it('props 缺失时默认为 {}', () => {
    const raw = JSON.stringify([{ type: 'span' }])
    expect(compileRule(raw)[0]!.props).toEqual({})
  })

  it('children null → 不含 children 字段', () => {
    const raw = JSON.stringify([{ type: 'div', children: null }])
    const rule = compileRule(raw)[0]!
    expect('children' in rule).toBe(false)
  })

  it('children 数组 → 递归规范化子节点', () => {
    const raw = JSON.stringify([{
      type: 'div',
      children: [
        '文本节点',
        { type: 'span' },
        { type: 'em', props: { class: 'red' }, children: null }
      ]
    }])
    const rule = compileRule(raw)[0]!
    expect(rule.children).toHaveLength(3)
    expect(rule.children![0]).toBe('文本节点')
    expect((rule.children![1] as typeof rule).type).toBe('span')
    expect((rule.children![1] as typeof rule).props).toEqual({})
    expect('children' in (rule.children![2] as typeof rule)).toBe(false)
  })
})

describe('normalizeRuleNode', () => {
  it('字符串节点 → { type: string }', () => {
    expect(normalizeRuleNode('my-widget')).toEqual({ type: 'my-widget' })
  })

  it('null/undefined → type="null"/"undefined"', () => {
    expect(normalizeRuleNode(null).type).toBe('null')
    expect(normalizeRuleNode(undefined).type).toBe('undefined')
  })
})

describe('parsePageData', () => {
  const makeRaw = (name: string, tables: Record<string, unknown> = {}) =>
    JSON.stringify({ dataSetName: name, tables, version: undefined, pageId: undefined })

  it('返回 DataSet 实例', () => {
    const result = parsePageData(makeRaw('OrderDS'))
    expect(result).toBeInstanceOf(DataSet)
  })

  it('dataSetName 正确传入', () => {
    const result = parsePageData(makeRaw('UserDS'))
    expect(result.dataSetName).toBe('UserDS')
  })

  it('含 tables 时构建 DataTable', () => {
    const raw = JSON.stringify({
      dataSetName: 'TestDS',
      tables: {
        Orders: { tableName: 'Orders', columns: [], rows: [], api: undefined, views: undefined, loading: undefined, error: undefined }
      }
    })
    const result = parsePageData(raw)
    expect(result).toBeInstanceOf(DataSet)
    expect(result.tables['Orders']).toBeDefined()
  })

  it('generic page data creates one-table-per-key (handles null)', () => {
    const raw = JSON.stringify({
      currentUser: 'user1',
      tableData: [],
      responseData: null
    })
    const result = parsePageData(raw)
    expect(result).toBeInstanceOf(DataSet)

    // currentUser becomes a single-row table with value 'user1'
    const cuView = result.getView('currentUser')
    expect(cuView).toBeDefined()
    expect(cuView!.rows[0]?.['value']).toBe('user1')

    // tableData is an empty array → empty-rows table
    const tdView = result.getView('tableData')
    expect(tdView).toBeDefined()
    expect(tdView!.rows).toEqual([])

    // responseData null should still convert to a single-row table
    const rdView = result.getView('responseData')
    expect(rdView).toBeDefined()
    expect(rdView!.rows[0]?.['value']).toBeNull()
  })
})

describe('parseScript', () => {
  it('直接返回原始字符串（透传）', () => {
    const code = 'function onLoad() { console.log("hi") }'
    expect(parseScript(code)).toBe(code)
  })

  it('空字符串原样返回', () => {
    expect(parseScript('')).toBe('')
  })
})

describe('parseCss', () => {
  it('直接返回原始样式字符串（透传）', () => {
    const css = '.app { color: red; font-size: 14px; }'
    expect(parseCss(css)).toBe(css)
  })

  it('空字符串原样返回', () => {
    expect(parseCss('')).toBe('')
  })
})
