/**
 * PageConfigLoader 单元测试
 *
 * 策略：
 * - createFileLoader 被 mock，直接控制 fileLoader.load() 返回值
 * - 页面四文件读取都委托 FileLoader，以覆盖统一缓存路径
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFileLoader, createRequest, type FileLoadResult } from '@spark-view/spark-utils'
import { PageConfigFileApi, PageConfigLoader, compileRule, normalizeRuleNode, parsePageData, parseScript, parseCss } from '@spark-view/spark-page-config'
import type { RuleConfig, SparkNode } from '@spark-view/spark-page-config'
import { DataSet } from '@spark-view/spark-data'

// ── Mock FileLoader ──────────────────────────────────────────────────────────

const mockFileLoader = {
  load: vi.fn(),
  loadBatch: vi.fn(),
  on: vi.fn(() => vi.fn()),
  clearCache: vi.fn(),
  hasCache: vi.fn(),
  getTimestamp: vi.fn(),
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
  // 默认远程文件 API（使用 FileLoader）
  // ─────────────────────────────────────────────────────────────────

  describe('default remote source', () => {
    let loader: PageConfigLoader

    beforeEach(() => {
      loader = new PageConfigLoader()
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

    it('loadScript: 无脚本文件 → 返回失败，不生成空文件', async () => {
      mockFileLoader.load.mockResolvedValue(fileFail('Not found'))
      const r = await loader.loadScript('order-page')
      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
    })

    it('loadCss: 有样式文件', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk('.root { color: red }'))
      const r = await loader.loadCss('order-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('.root { color: red }')
      expect(mockFileLoader.load).toHaveBeenCalledWith('/order-page/style.css')
    })

    it('loadCss: 无样式文件 → 返回失败，不生成空文件', async () => {
      mockFileLoader.load.mockResolvedValue(fileFail('Not found'))
      const r = await loader.loadCss('order-page')
      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
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

    it('loadPageConfig: script 非 404 失败 → 返回失败', async () => {
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/order-page/rule.json') return Promise.resolve(fileOk([{ type: 'div' }]))
        if (path === '/order-page/pagedata.json') return Promise.resolve(fileOk({ x: 1 }))
        if (path === '/order-page/script.js') return Promise.resolve(fileFail('no script'))
        if (path === '/order-page/style.css') return Promise.resolve(fileOk('.app{}'))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(false)
      expect(r.error).toContain('no script')
    })

    it('loadPageConfig: css 非 404 失败 → 返回失败', async () => {
      mockFileLoader.load.mockImplementation((path: string) => {
        if (path === '/order-page/rule.json') return Promise.resolve(fileOk([{ type: 'div' }]))
        if (path === '/order-page/pagedata.json') return Promise.resolve(fileOk({ x: 1 }))
        if (path === '/order-page/script.js') return Promise.resolve(fileOk('// script'))
        if (path === '/order-page/style.css') return Promise.resolve(fileFail('no css file'))
        return Promise.resolve(fileFail(`unexpected path: ${path}`))
      })

      const r = await loader.loadPageConfig('order-page')
      expect(r.success).toBe(false)
      expect(r.error).toContain('no css file')
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
  // 显式 API 基础路径
  // ─────────────────────────────────────────────────────────────────

  describe('custom apiBaseUrl', () => {
    let loader: PageConfigLoader

    beforeEach(() => {
      loader = new PageConfigLoader({ apiBaseUrl: '/api' })
    })

    it('pagesConfigBaseUrl: 四文件加载使用项目 scoped 地址，通用 HTTP client 保持 apiBaseUrl', () => {
      const pagesConfigBaseUrl = '/api/tenants/lmspark/projects/homepage/pages-config'
      const getHeaders = () => ({ Authorization: 'Bearer token' })

      loader = new PageConfigLoader({
        apiBaseUrl: '/api',
        pagesConfigBaseUrl,
        getHeaders,
      })

      expect(vi.mocked(createFileLoader)).toHaveBeenLastCalledWith(expect.objectContaining({
        baseUrl: pagesConfigBaseUrl,
        getHeaders,
      }))
      expect(vi.mocked(createRequest)).toHaveBeenLastCalledWith(expect.objectContaining({
        baseURL: '/api',
      }))
    })

    it('loadRule: 远程读取 pages-config 文件接口并编译规则', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk([{ type: 'div', id: 'remote-root', props: {} }]))

      const r = await loader.loadRule('remote-page')
      expect(r.success).toBe(true)
      expect(r.data?.[0]?.type).toBe('div')
      expect(r.data?.[0]?.['id']).toBe('remote-root')
      expect(r.data?.[0]?.props).toEqual({})
      expect(r.source).toBe('remote')
      expect(mockFileLoader.load).toHaveBeenCalledWith('/remote-page/rule.json')
    })

    it('loadRule: 远程 rule.json 不存在时返回 not-found 失败', async () => {
      mockFileLoader.load.mockResolvedValue({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadRule('missing-page')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(r.data).toBeUndefined()
    })

    it('loadPageConfig: 远程 rule.json 不存在时 fail-fast', async () => {
      mockFileLoader.load.mockResolvedValueOnce({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadPageConfig('missing-page')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(mockFileLoader.load).toHaveBeenCalledTimes(1)
      expect(mockFileLoader.load).toHaveBeenCalledWith('/missing-page/rule.json')
    })

    it('loadPageConfig: 文件清单确认缺失时直接返回 not-found，不触发四文件 GET', async () => {
      mockRequestClient.get.mockResolvedValue([
        { pageId: 'data-report', files: [] },
      ])

      const r = await loader.loadPageConfig('data-report')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(r.error).toContain('/data-report/rule.json')
      expect(mockRequestClient.get).toHaveBeenCalledWith('/__list', undefined, {
        meta: { silentHttpError: true },
      })
      expect(mockFileLoader.load).not.toHaveBeenCalled()
    })

    it('loadPageConfig: 远程 pagedata.json 不存在时 fail-fast', async () => {
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk([{ type: 'div', id: 'remote-root' }]))
        .mockResolvedValueOnce({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadPageConfig('missing-data-page')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(mockFileLoader.load).toHaveBeenCalledTimes(2)
      expect(mockFileLoader.load).toHaveBeenLastCalledWith('/missing-data-page/pagedata.json')
    })

    it('loadPageConfig: 远程 script.js 不存在时 fail-fast', async () => {
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk([{ type: 'div', id: 'remote-root' }]))
        .mockResolvedValueOnce(fileOk({ dataSetName: 'Empty', tables: {} }))
        .mockResolvedValueOnce({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadPageConfig('missing-assets-page')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(mockFileLoader.load).toHaveBeenCalledTimes(3)
      expect(mockFileLoader.load).toHaveBeenLastCalledWith('/missing-assets-page/script.js')
    })

    it('loadPageConfig: 远程 style.css 不存在时 fail-fast', async () => {
      mockFileLoader.load
        .mockResolvedValueOnce(fileOk([{ type: 'div', id: 'remote-root' }]))
        .mockResolvedValueOnce(fileOk({ dataSetName: 'Empty', tables: {} }))
        .mockResolvedValueOnce(fileOk(''))
        .mockResolvedValueOnce({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadPageConfig('missing-style-page')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(mockFileLoader.load).toHaveBeenCalledTimes(4)
      expect(mockFileLoader.load).toHaveBeenLastCalledWith('/missing-style-page/style.css')
    })

    it('loadScript: 远程 fetch 文本文件', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk('function onLoad() { return 1 }'))

      const r = await loader.loadScript('my-page')
      expect(r.success).toBe(true)
      expect(r.data).toContain('onLoad')
      expect(r.source).toBe('remote')
      expect(mockFileLoader.load).toHaveBeenCalledWith('/my-page/script.js')
    })

    it('loadScript: 远程脚本 404 → 返回失败，不生成空文件', async () => {
      mockFileLoader.load.mockResolvedValue({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadScript('my-page')
      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
    })

    it('loadScript: 非 404 错误不吞掉为可选空文件', async () => {
      mockFileLoader.load.mockResolvedValue({ success: false, error: 'network down', fromCache: false, reason: 'network' })

      const r = await loader.loadScript('my-page')

      expect(r.success).toBe(false)
      expect(r.error).toContain('network down')
      expect(r.reason).toBe('network')
    })

    it('loadCss: 远程 CSS 文本', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk('.app { color: blue }'))

      const r = await loader.loadCss('my-page')
      expect(r.success).toBe(true)
      expect(r.data).toBe('.app { color: blue }')
    })

    it('loadPageFileContent: 读取原始文本并支持强制刷新', async () => {
      mockFileLoader.load.mockResolvedValue(fileOk('[]\n'))

      const r = await loader.loadPageFileContent('my-page', 'rule.json', { forceReload: true })

      expect(r).toMatchObject({ success: true, data: '[]\n', source: 'remote' })
      expect(mockFileLoader.load).toHaveBeenCalledWith('/my-page/rule.json', {
        parseJSON: false,
        forceRefresh: true,
      })
    })

    it('loadPageFileContent: 远程 rule.json 不存在时返回 not-found，不伪造编辑文本', async () => {
      mockFileLoader.load.mockResolvedValue({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const r = await loader.loadPageFileContent('missing-page', 'rule.json')

      expect(r.success).toBe(false)
      expect(r.reason).toBe('not-found')
      expect(r.data).toBeUndefined()
    })

    it('loadPageFileContent: 远程 script/style 不存在时返回失败，不生成空文本', async () => {
      mockFileLoader.load.mockResolvedValue({ success: false, error: 'not found', fromCache: false, reason: 'not-found' })

      const script = await loader.loadPageFileContent('missing-page', 'script.js')
      const style = await loader.loadPageFileContent('missing-page', 'style.css')

      expect(script.success).toBe(false)
      expect(script.reason).toBe('not-found')
      expect(style.success).toBe(false)
      expect(style.reason).toBe('not-found')
    })
  })

})

describe('PageConfigFileApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequestClient.get.mockReset()
    mockRequestClient.post.mockReset()
    mockRequestClient.put.mockReset()
    mockRequestClient.delete.mockReset()
  })

  it('saveFileContent: 写入页面配置文件原文', async () => {
    const api = new PageConfigFileApi({
      getPageConfigApi: () => '/api/pages-config',
      http: mockRequestClient,
    })
    mockRequestClient.put.mockResolvedValue({})

    await api.saveFileContent('page 1', 'rule.json', '[]\n')

    expect(mockRequestClient.put).toHaveBeenCalledWith(
      '/api/pages-config/page%201/rule.json',
      '[]\n',
      { headers: { 'Content-Type': 'text/plain' } },
    )
  })

  it('listVersions: 归一化后端版本摘要', async () => {
    const api = new PageConfigFileApi({
      getPageConfigApi: () => '/api/pages-config/',
      http: mockRequestClient,
    })
    mockRequestClient.get.mockResolvedValue([
      { version: '2', createdAt: 1710000000000, isCurrent: true, modifiedBy: 'alice' },
      { version: 0, createdAt: 'ignored', isCurrent: false },
    ])

    await expect(api.listVersions('my-page', 'pagedata.json')).resolves.toEqual([
      {
        version: 2,
        createdAt: new Date(1710000000000).toISOString(),
        isCurrent: true,
        modifiedBy: 'alice',
      },
    ])
    expect(mockRequestClient.get).toHaveBeenCalledWith('/api/pages-config/my-page/pagedata.json/__versions')
  })

  it('restore/deleteVersion: 拒绝无效版本号', async () => {
    const api = new PageConfigFileApi({
      getPageConfigApi: () => '/api/pages-config',
      http: mockRequestClient,
    })

    await expect(api.restoreVersion('my-page', 'style.css', 0)).rejects.toThrow(/positive integer/)
    await expect(api.deleteVersion('my-page', 'style.css', 1.5)).rejects.toThrow(/positive integer/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 编译 transform 函数单元测试（与 PageConfigLoader 解耦）
// ────────────────────────────────────────────────────────────────────────────

describe('compileRule', () => {
  it('空 rule.json 作为空规则树处理', () => {
    expect(compileRule('')).toEqual([])
    expect(compileRule('   \n')).toEqual([])
  })

  it('解析 JSON 数组为 SparkNode[]', () => {
    const raw = JSON.stringify([{ type: 'div', id: 'root', props: { class: 'page-root' } }])
    const result = compileRule(raw)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('div')
    expect(result[0]!['id']).toBe('root')
    expect(result[0]!.props).toEqual({ class: 'page-root' })
    expect(result[0]!.children).toEqual([])
  })

  it('兼容 props.id 输入，规范化后只保留顶层 id', () => {
    const raw = JSON.stringify([{
      type: 'r-table',
      props: {
        id: 'legacy-table',
        dataKey: 'Orders@rows',
      },
    }])
    const result = compileRule(raw)
    expect(result[0]!.id).toBe('legacy-table')
    expect(result[0]!.props).toEqual({ dataKey: 'Orders@rows' })
  })

  it('props.id 与顶层 id 同时存在时以顶层 id 为准', () => {
    const raw = JSON.stringify([{
      type: 'r-table',
      id: 'orders-table',
      props: {
        id: 'legacy-table',
        dataKey: 'Orders@rows',
      },
    }])
    const result = compileRule(raw)
    expect(result[0]!.id).toBe('orders-table')
    expect(result[0]!.props).toEqual({ dataKey: 'Orders@rows' })
  })

  it('RuleConfig 与 SparkNode 可直接互换', () => {
    const raw = JSON.stringify([{ type: 'r-card', id: 'card-1', children: [{ type: 'r-text' }, 'plain', 1] }])
    const first: RuleConfig = compileRule(raw)[0]!
    const asSparkNode: SparkNode = first
    const asRuleConfig: RuleConfig = asSparkNode

    expect(asRuleConfig).toEqual({
      type: 'r-card',
      id: 'card-1',
      children: [{ type: 'r-text', children: [] }, 'plain', 1],
    })
  })

  it('保留跨框架 value 配置，不在 page-config 编译层绑定 Vue modelValue', () => {
    const raw = JSON.stringify([
      {
        type: 'r-tabs',
        props: { value: 'list' },
      },
      {
        type: 'r-select',
        props: {
          field: 'status',
          value: 'pending',
          options: [
            { label: '待审批', value: 'pending' },
          ],
        },
      },
      {
        type: 'r-text-display',
        props: { value: '-' },
      },
      {
        type: 'r-dialog',
        props: { value: true, modelValue: false },
      },
    ])
    const result = compileRule(raw)

    expect(result[0]!.props).toEqual({ value: 'list' })
    expect(result[1]!.props).toEqual({
      field: 'status',
      value: 'pending',
      options: [
        { label: '待审批', value: 'pending' },
      ],
    })
    expect(result[2]!.props).toEqual({ value: '-' })
    expect(result[3]!.props).toEqual({ value: true, modelValue: false })
  })

  it('单根 SparkNode 作为规则树处理', () => {
    const raw = JSON.stringify({ type: 'el-button', props: { text: 'OK' } })
    const result = compileRule(raw)

    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('el-button')
    expect(result[0]!.props).toEqual({ text: 'OK' })
  })

  it('非法 rule.json 根结构抛错', () => {
    const raw = JSON.stringify('not-a-node')
    expect(() => compileRule(raw)).toThrow(/SparkNode 或 SparkNode\[\]/)
  })

  it('type 缺失时抛错', () => {
    const raw = JSON.stringify([{}])
    expect(() => compileRule(raw)).toThrow(/SparkNode/)
  })

  it('根级业务字段抛错，业务输入必须进入 props', () => {
    const raw = JSON.stringify([{ type: 'span', class: 'legacy-root-field' }])
    expect(() => compileRule(raw)).toThrow(/root field "class" is invalid/)
  })

  it('props 缺失时不补空对象', () => {
    const raw = JSON.stringify([{ type: 'span' }])
    expect(compileRule(raw)[0]!.props).toBeUndefined()
  })

  it('children null → 归一为空数组', () => {
    const raw = JSON.stringify([{ type: 'div', children: null }])
    const rule = compileRule(raw)[0]!
    expect(rule.children).toEqual([])
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
    expect((rule.children![1] as typeof rule).props).toBeUndefined()
    expect((rule.children![2] as typeof rule).children).toEqual([])
  })
})

describe('normalizeRuleNode', () => {
  it('合法 SparkNode → 规范化 SparkNode', () => {
    expect(normalizeRuleNode({ type: 'my-widget' })).toEqual({ type: 'my-widget', children: [] })
  })

  it('非法节点会抛错', () => {
    expect(() => normalizeRuleNode(null)).toThrow(/SparkNode/)
    expect(() => normalizeRuleNode(undefined)).toThrow(/SparkNode/)
    expect(() => normalizeRuleNode('my-widget')).toThrow(/SparkNode/)
  })
})

describe('parsePageData', () => {
  const makeRaw = (name: string, tables: Record<string, unknown> = {}) =>
    JSON.stringify({ dataSetName: name, tables, version: undefined, pageId: undefined })

  it('空 pagedata.json 作为空 DataSet 处理', () => {
    const result = parsePageData('')
    expect(result).toBeInstanceOf(DataSet)
  })

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
