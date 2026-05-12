import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPageConfigWorkspaceDataService,
  PageConfigFileReadError,
} from '@spark-view/spark-page-config/services'
import type { ConfigLoader, ConfigLoaderOptions } from '@spark-view/spark-page-config'
import type { HttpClient } from '@spark-view/spark-utils'

const mocks = vi.hoisted(() => {
  const loader = {
    loadPageFileContent: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn(() => ({ size: 0, keys: [] })),
  }
  return {
    loader,
    createConfigLoader: vi.fn(() => loader),
    refreshRoutes: vi.fn(),
    http: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  }
})

function createService() {
  return createPageConfigWorkspaceDataService({
    http: mocks.http as unknown as HttpClient,
    getPageConfigApi: () => '/api/tenants/t1/projects/p1/pages-config',
    getNavApi: () => '/api/tenants/t1/projects/p1/navigation',
    getProjectApi: () => '/api/tenants/t1/projects',
    getTenantId: () => 'tenant-a',
    getHeaders: () => ({ Authorization: 'Bearer test' }),
    createLoader: mocks.createConfigLoader as unknown as (options: Partial<ConfigLoaderOptions>) => ConfigLoader,
    onNavigationChanged: mocks.refreshRoutes,
  })
}

describe('PageConfigWorkspaceDataService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads page file text through the scoped config loader and fails missing files explicitly', async () => {
    const service = createService()
    mocks.loader.loadPageFileContent.mockResolvedValueOnce({
      success: false,
      reason: 'not-found',
      timestamp: Date.now(),
    })

    await expect(service.pageConfig.readFileText('demo', 'script.js')).rejects.toBeInstanceOf(PageConfigFileReadError)

    expect(mocks.createConfigLoader).toHaveBeenCalledWith({
      pagesConfigBaseUrl: '/api/tenants/t1/projects/p1/pages-config',
      fileStorage: 'localStorage',
      getHeaders: expect.any(Function),
    })
    expect(mocks.loader.loadPageFileContent).toHaveBeenCalledWith('demo', 'script.js', { forceReload: false })
  })

  it('can treat a missing single page config file as empty text by policy', async () => {
    const service = createService()
    mocks.loader.loadPageFileContent.mockResolvedValueOnce({
      success: false,
      reason: 'not-found',
      timestamp: Date.now(),
    })

    await expect(service.pageConfig.readFileText('demo', 'style.css', { missing: 'empty' }))
      .resolves.toBe('')
  })

  it('reads a page config file set as a four-file aggregate', async () => {
    const service = createService()
    mocks.loader.loadPageFileContent.mockImplementation(async (_pageId: string, filename: string) => {
      if (filename === 'style.css') {
        return { success: false, reason: 'not-found', timestamp: Date.now() }
      }
      return { success: true, data: `content:${filename}`, source: 'remote', timestamp: Date.now() }
    })

    await expect(service.pageConfig.readFiles('demo', { forceReload: true, missing: 'empty' }))
      .resolves.toEqual({
        'rule.json': 'content:rule.json',
        'pagedata.json': 'content:pagedata.json',
        'script.js': 'content:script.js',
        'style.css': '',
      })

    expect(mocks.loader.loadPageFileContent).toHaveBeenCalledWith('demo', 'rule.json', { forceReload: true })
    expect(mocks.loader.loadPageFileContent).toHaveBeenCalledWith('demo', 'pagedata.json', { forceReload: true })
    expect(mocks.loader.loadPageFileContent).toHaveBeenCalledWith('demo', 'script.js', { forceReload: true })
    expect(mocks.loader.loadPageFileContent).toHaveBeenCalledWith('demo', 'style.css', { forceReload: true })
  })

  it('saves page files through the file API and clears only that file cache', async () => {
    const service = createService()
    mocks.http.put.mockResolvedValueOnce({})

    await service.pageConfig.saveFileContent('demo', 'style.css', '.page {}')

    expect(mocks.http.put).toHaveBeenCalledWith(
      '/api/tenants/t1/projects/p1/pages-config/demo/style.css',
      '.page {}',
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/demo/style.css')
  })

  it('saves only changed files from a page config file patch', async () => {
    const service = createService()
    mocks.http.put.mockResolvedValue({})

    await service.pageConfig.saveFiles('demo', {
      'rule.json': '[]',
      'script.js': 'console.log("x")',
    })

    expect(mocks.http.put).toHaveBeenCalledTimes(2)
    expect(mocks.http.put).toHaveBeenCalledWith(
      '/api/tenants/t1/projects/p1/pages-config/demo/rule.json',
      '[]',
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(mocks.http.put).toHaveBeenCalledWith(
      '/api/tenants/t1/projects/p1/pages-config/demo/script.js',
      'console.log("x")',
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/demo/rule.json')
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/demo/script.js')
  })

  it('owns config page creation and cache invalidation', async () => {
    const service = createService()
    mocks.http.post.mockResolvedValueOnce({})

    await service.pageConfig.createPage({ pageId: 'orders', title: 'Orders', icon: 'Document' })

    expect(mocks.http.post).toHaveBeenCalledWith('/api/tenants/t1/projects/p1/pages-config/__create', {
      pageId: 'orders',
      title: 'Orders',
      icon: 'Document',
    })
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/orders/rule.json')
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/orders/pagedata.json')
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/orders/script.js')
    expect(mocks.loader.clearCache).toHaveBeenCalledWith('/orders/style.css')
  })

  it('creates config pages only when page data is absent', async () => {
    const service = createService()
    mocks.http.get.mockResolvedValueOnce([{ pageId: 'orders', hasDir: true }])
    mocks.http.get.mockResolvedValueOnce([])
    mocks.http.post.mockResolvedValueOnce({})

    await expect(service.pageConfig.ensurePage({ pageId: 'orders', title: 'Orders', icon: 'Document' }))
      .resolves.toEqual({ created: false })
    await expect(service.pageConfig.ensurePage({ pageId: 'users', title: 'Users', icon: 'User' }))
      .resolves.toEqual({ created: true })

    expect(mocks.http.post).toHaveBeenCalledTimes(1)
    expect(mocks.http.post).toHaveBeenCalledWith('/api/tenants/t1/projects/p1/pages-config/__create', {
      pageId: 'users',
      title: 'Users',
      icon: 'User',
    })
  })

  it('owns navigation persistence, refresh, and cross-project navigation reads', async () => {
    const service = createService()
    mocks.http.put.mockResolvedValueOnce({})
    mocks.http.get.mockResolvedValueOnce({ children: [] })

    await service.navigation.saveNode('node/1', { id: 'node/1', title: 'Node', nodeKind: 'page' })
    await service.projects.loadNavigation('project-b')

    expect(mocks.http.put).toHaveBeenCalledWith(
      '/api/tenants/t1/projects/p1/navigation/nodes/node%2F1',
      { id: 'node/1', title: 'Node', nodeKind: 'page' },
    )
    expect(mocks.refreshRoutes).toHaveBeenCalledOnce()
    expect(mocks.http.get).toHaveBeenCalledWith('/api/tenants/tenant-a/projects/project-b/navigation')
  })

  it('creates page navigation nodes only when no matching id or path exists', async () => {
    const service = createService()
    mocks.http.get.mockResolvedValueOnce([{ id: 'orders', path: '/orders' }])
    mocks.http.get.mockResolvedValueOnce([{ id: 'other', path: '/other' }])
    mocks.http.post.mockResolvedValueOnce({})

    await expect(service.navigation.ensurePageNode({ pageId: 'orders', title: 'Orders', icon: 'Document' }))
      .resolves.toEqual({ created: false })
    await expect(service.navigation.ensurePageNode({ pageId: 'users', title: 'Users', icon: 'User' }))
      .resolves.toEqual({ created: true })

    expect(mocks.http.post).toHaveBeenCalledWith('/api/tenants/t1/projects/p1/navigation/nodes', {
      node: {
        id: 'users',
        title: 'Users',
        icon: 'User',
        nodeKind: 'page',
        path: '/users',
      },
    })
  })

  it('ensures a page config entry across files and navigation', async () => {
    const service = createService()
    mocks.http.get.mockResolvedValueOnce([])
    mocks.http.get.mockResolvedValueOnce([])
    mocks.http.post.mockResolvedValue({})

    await expect(service.ensurePageConfigEntry({ pageId: 'metrics', title: 'Metrics', icon: 'TrendCharts' }))
      .resolves.toEqual({ pageCreated: true, navNodeCreated: true })

    expect(mocks.http.post).toHaveBeenCalledWith('/api/tenants/t1/projects/p1/pages-config/__create', {
      pageId: 'metrics',
      title: 'Metrics',
      icon: 'TrendCharts',
    })
    expect(mocks.http.post).toHaveBeenCalledWith('/api/tenants/t1/projects/p1/navigation/nodes', {
      node: {
        id: 'metrics',
        title: 'Metrics',
        icon: 'TrendCharts',
        nodeKind: 'page',
        path: '/metrics',
      },
    })
  })
})
