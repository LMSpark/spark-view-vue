import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@spark-view/spark-utils'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { DataSetMetadata } from '@spark-view/spark-data'
import {
  NavigationConfigClient,
  PAGE_DESIGN_100_STEP_FLOW,
  PageConfigEditWorkspace,
  PageConfigFileApi,
  PageConfigFileLifecycle,
  PageDesignService,
  applyNavigationNodeDraftToNode,
  buildDataSetMetadataFromDesignerProjection,
  buildNavRoot,
  canUseStructuredPageDataEditor,
  createNavigationNodeDraft,
  createReservedRootGroup,
  createRuleJsonSchema,
  createRuleTreePolicy,
  findConfigNodeByPageId,
  findNodeLocation,
  getNextPageDesignFlowStep,
  normalizeNavRoot,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  summarizePageDesignFlowPhases,
  type AppNavRoot,
  BasePageConfigLoader,
  type ConfigLoadResult,
  type NavNode,
  type PageConfig,
  type PageConfigFileLoadOptions,
  type PageConfigFileName,
  type PageCssConfig,
  type PageDataConfig,
  type PageScriptConfig,
  type RuleEditorComponentMetadata,
  type RuleConfig,
} from '@spark-view/spark-page-config'

function createHttpMock(): HttpClientBase {
  const client = createRequest()
  vi.spyOn(client, 'request').mockRejectedValue(new Error('Unexpected request call'))
  vi.spyOn(client, 'requestFull').mockRejectedValue(new Error('Unexpected requestFull call'))
  vi.spyOn(client, 'get').mockRejectedValue(new Error('Unexpected get call'))
  vi.spyOn(client, 'post').mockRejectedValue(new Error('Unexpected post call'))
  vi.spyOn(client, 'put').mockRejectedValue(new Error('Unexpected put call'))
  vi.spyOn(client, 'patch').mockRejectedValue(new Error('Unexpected patch call'))
  vi.spyOn(client, 'delete').mockRejectedValue(new Error('Unexpected delete call'))
  vi.spyOn(client, 'clearCache').mockImplementation(() => undefined)
  return client
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value !== null && value !== undefined) return value
  throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(message)
}

class TestPageConfigLoader extends BasePageConfigLoader {
  readonly loadPageFileContentSpy: (
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ) => Promise<ConfigLoadResult<string>>

  readonly clearCacheSpy = vi.fn()

  constructor(files: Partial<Record<string, string>>) {
    super()
    this.loadPageFileContentSpy = vi.fn(async (pageId: string, filename: PageConfigFileName, options?: PageConfigFileLoadOptions) => {
      const key = `${pageId}/${filename}`
      if (!Object.hasOwn(files, key)) {
        const result: ConfigLoadResult<string> = {
          success: false,
          error: `${key} not found`,
          reason: 'not-found',
          timestamp: options?.forceReload ? 2 : 1,
        }
        return result
      }
      const result: ConfigLoadResult<string> = {
        success: true,
        data: files[key] ?? '',
        source: 'remote',
        timestamp: options?.forceReload ? 2 : 1,
      }
      return result
    })
  }

  override loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    return this.unsupported(pageId, 'page config')
  }

  override loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    return this.unsupported(pageId, 'rule')
  }

  override loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    return this.unsupported(pageId, 'pagedata')
  }

  override loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    return this.unsupported(pageId, 'script')
  }

  override loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    return this.unsupported(pageId, 'style')
  }

  override loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>> {
    return this.loadPageFileContentSpy(pageId, filename, options)
  }

  override clearCache(key?: string): void {
    this.clearCacheSpy(key)
  }

  override getCacheStats(): { size: number; keys: string[] } {
    return { size: 0, keys: [] }
  }

  private unsupported<T>(pageId: string, label: string): Promise<ConfigLoadResult<T>> {
    return Promise.resolve({
      success: false,
      error: `TestPageConfigLoader does not load ${label}: ${pageId}`,
      timestamp: 0,
    })
  }
}

function createLoader(files: Partial<Record<string, string>>): TestPageConfigLoader {
  return new TestPageConfigLoader(files)
}

describe('DevSystem navigation SSOT', () => {
  it('normalizes nodes, locates config pages and applies node draft patches', () => {
    const root = normalizeNavRoot({
      title: 'Demo',
      childPlacement: 'bad',
      children: [
        {
          id: 'module',
          title: 'Module',
          childPlacement: 'sidebar',
          children: [
            { id: 'page', title: 'Page', path: '/orders' },
            { id: 'link', title: 'Link', path: 'https://example.com', linkTarget: 'new-tab' },
            { id: 'sub', title: 'Sub', nodeKind: 'sub-page', path: '/hidden' },
          ],
        },
      ],
    })

    expect(root.childPlacement).toBe('header')
    expect(root.children[0]?.nodeKind).toBe('page')
    const page = findConfigNodeByPageId(root.children, 'orders')
    expect(page?.id).toBe('page')
    expect(root.children[0]?.children?.[1]?.nodeKind).toBe('link')
    expect(root.children[0]?.children?.[2]?.hidden).toBe(true)
    expect(root.children[0]?.children?.[2]?.path).toBeUndefined()

    const pageNode = requireValue(page, 'Expected orders page node')
    const draft = createNavigationNodeDraft(pageNode)
    draft.draft.title = 'Orders'
    draft.draft.nodeKind = 'ref'
    draft.draft.refId = 'remote-page'
    const result = applyNavigationNodeDraftToNode(pageNode, draft)

    expect(result.patch).toMatchObject({ id: 'page', title: 'Orders', nodeKind: 'ref', refId: 'remote-page' })
    expect(page?.path).toBeUndefined()
    expect(findNodeLocation(root.children, 'sub')).toMatchObject({
      parentId: 'module',
      index: 2,
    })
  })

  it('keeps reserved root group templates and node-first persistence endpoints in one client', async () => {
    const demo = normalizeNavRoot({
      title: 'Demo',
      childPlacement: 'header',
      children: [
        { id: 'toolbar', title: 'Toolbar', nodeKind: 'system-directory', childPlacement: 'toolbar', children: [] },
      ],
    })
    const reserved = createReservedRootGroup('toolbar', { createId: () => 'new-toolbar', templateRoot: demo })
    expect(reserved).toMatchObject({ id: 'new-toolbar', title: 'Toolbar', childPlacement: 'toolbar' })

    const http = createHttpMock()
    const remoteRoot: AppNavRoot = { title: 'Remote', childPlacement: 'sidebar', children: [] }
    const initialNode: NavNode = { id: 'n1', title: 'N1' }
    const updatedNode: NavNode = { id: 'n1', title: 'N2' }

    vi.mocked(http.get).mockResolvedValueOnce(remoteRoot)
    vi.mocked(http.post).mockResolvedValueOnce({ node: { id: 'n1', title: 'N1' } })
    vi.mocked(http.put)
      .mockResolvedValueOnce({ node: updatedNode })
      .mockResolvedValueOnce({ node: updatedNode })
      .mockResolvedValueOnce({})
    vi.mocked(http.delete).mockResolvedValueOnce({ deleted: { id: 'n1' } })
    const client = new NavigationConfigClient({ getNavigationApi: () => '/api/navigation/', http })

    await expect(client.loadRoot()).resolves.toMatchObject({ title: 'Remote', childPlacement: 'sidebar' })
    await client.addNode({ parentId: 'parent', node: initialNode, index: 1 })
    await client.updateNode('n1', { title: 'N2' })
    await client.moveNode('n1', null, 0)
    await client.deleteNode('n1')
    await client.saveRoot(buildNavRoot([]))

    expect(http.post).toHaveBeenCalledWith('/api/navigation/nodes', {
      parentId: 'parent',
      node: { id: 'n1', title: 'N1' },
      index: 1,
    })
    expect(http.put).toHaveBeenCalledWith('/api/navigation/nodes/n1', { title: 'N2' })
    expect(http.put).toHaveBeenCalledWith('/api/navigation/nodes/n1/move', { newParentId: null, index: 0 })
    expect(http.delete).toHaveBeenCalledWith('/api/navigation/nodes/n1')
    expect(http.put).toHaveBeenCalledWith('/api/navigation', expect.objectContaining({ children: [] }))
  })
})

describe('PageConfigEditWorkspace', () => {
  it('loads four files through the loader, saves dirty text and clears cache', async () => {
    const http = createHttpMock()
    vi.mocked(http.put).mockResolvedValue({})
    const api = new PageConfigFileApi({ getPageConfigApi: () => '/api/pages-config/', http })
    const loader = createLoader({
      'orders/rule.json': '[{"type":"div"}]',
      'orders/pagedata.json': '{"dataSetName":"Orders","tables":{}}',
      'orders/script.js': 'export default {}',
      'orders/style.css': '.page{}',
    })
    const workspace = new PageConfigEditWorkspace({ fileApi: api, getConfigLoader: () => loader })

    workspace.setActivePage('orders')
    await workspace.ensureActivePageFilesLoaded()

    expect(loader.loadPageFileContentSpy).toHaveBeenCalledTimes(4)
    expect(workspace.documents['rule.json'].loadState.value).toBe('loaded')
    expect(workspace.documents['script.js'].text.value).toBe('export default {}')

    workspace.documents['script.js'].setText('console.log("changed")')
    expect(workspace.isDocumentDirty('script.js')).toBe(true)
    await workspace.savePageFile('script.js')

    expect(http.put).toHaveBeenCalledWith(
      '/api/pages-config/orders/script.js',
      'console.log("changed")',
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(workspace.isDocumentDirty('script.js')).toBe(false)
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/orders/script.js')
  })

  it('fails active page file load when the loader reports a missing file', async () => {
    const http = createHttpMock()
    const api = new PageConfigFileApi({ getPageConfigApi: () => '/api/pages-config/', http })
    const loader = createLoader({
      'orders/rule.json': '[{"type":"div"}]',
      'orders/pagedata.json': '{"dataSetName":"Orders","tables":{}}',
      'orders/style.css': '.page{}',
    })
    const workspace = new PageConfigEditWorkspace({ fileApi: api, getConfigLoader: () => loader })

    workspace.setActivePage('orders')

    await expect(workspace.ensureActivePageFilesLoaded()).rejects.toThrow('读取页面文件失败: orders/script.js')
    expect(workspace.documents['script.js'].text.value).toBe('')
    expect(workspace.documents['script.js'].loadState.value).toBe('idle')
  })

  it('wraps page list/create/delete and version restore with cache invalidation', async () => {
    const http = createHttpMock()
    vi.mocked(http.get).mockResolvedValueOnce([{ pageId: 'orders', pageType: 'config', files: ['rule.json'] }])
    vi.mocked(http.post).mockResolvedValue({})
    vi.mocked(http.delete).mockResolvedValue({})
    const api = new PageConfigFileApi({ getPageConfigApi: () => '/api/pages-config', http })
    const loader = createLoader({ 'orders/script.js': 'console.log("restored")' })
    const workspace = new PageConfigEditWorkspace({ fileApi: api, getConfigLoader: () => loader })

    await expect(workspace.listPages()).resolves.toEqual([
      { pageId: 'orders', pageType: 'config', files: ['rule.json'] },
    ])
    await workspace.createPage({ pageId: 'new-page', title: 'New Page' })
    await workspace.deletePage('new-page')

    workspace.setActivePage('orders')
    await workspace.restoreRemotePageVersion(2, 'script.js')

    expect(http.get).toHaveBeenCalledWith('/api/pages-config/__list')
    expect(http.post).toHaveBeenCalledWith('/api/pages-config/__create', { pageId: 'new-page', title: 'New Page' })
    expect(http.delete).toHaveBeenCalledWith('/api/pages-config/new-page')
    expect(http.post).toHaveBeenCalledWith('/api/pages-config/orders/script.js/__versions/2/__restore', {})
    expect(loader.loadPageFileContentSpy).toHaveBeenCalledWith('orders', 'script.js', { forceReload: true })
    expect(workspace.documents['script.js'].text.value).toBe('console.log("restored")')
  })
})

describe('PageConfigFileLifecycle', () => {
  it('creates page files, mounts navigation, and clears page cache', async () => {
    const http = createHttpMock()
    const mountedNode: NavNode = { id: 'new-page', title: 'New Page', nodeKind: 'page', path: '/new-page' }
    vi.mocked(http.post)
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ node: mountedNode })
    const api = new PageConfigFileApi({ getPageConfigApi: () => '/api/pages-config', http })
    const navigationClient = new NavigationConfigClient({ getNavigationApi: () => '/api/navigation', http })
    const loader = createLoader({})
    const lifecycle = new PageConfigFileLifecycle({
      fileApi: api,
      navigationClient,
      getConfigLoader: () => loader,
    })

    await expect(lifecycle.createMountedPage({
      pageId: 'new-page',
      title: 'New Page',
      parentId: 'parent',
      index: 2,
    })).resolves.toEqual({
      page: { created: true },
      node: mountedNode,
    })

    expect(http.post).toHaveBeenCalledWith('/api/pages-config/__create', {
      pageId: 'new-page',
      title: 'New Page',
    })
    expect(http.post).toHaveBeenCalledWith('/api/navigation/nodes', {
      parentId: 'parent',
      node: {
        id: 'new-page',
        title: 'New Page',
        icon: 'Document',
        nodeKind: 'page',
        path: '/new-page',
      },
      index: 2,
    })
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/new-page/rule.json')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/new-page/pagedata.json')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/new-page/script.js')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/new-page/style.css')
  })

  it('removes navigation mount, deletes page files, and clears page cache', async () => {
    const http = createHttpMock()
    const node: NavNode = { id: 'node-1', title: 'Orders', nodeKind: 'page', path: '/orders' }
    vi.mocked(http.get).mockResolvedValueOnce(buildNavRoot([node]))
    vi.mocked(http.delete)
      .mockResolvedValueOnce({ deleted: node })
      .mockResolvedValueOnce({})
    const api = new PageConfigFileApi({ getPageConfigApi: () => '/api/pages-config', http })
    const navigationClient = new NavigationConfigClient({ getNavigationApi: () => '/api/navigation', http })
    const loader = createLoader({})
    const lifecycle = new PageConfigFileLifecycle({
      fileApi: api,
      navigationClient,
      getConfigLoader: () => loader,
    })

    await expect(lifecycle.removeMountedPage({ pageId: 'orders' })).resolves.toEqual({
      deletedNode: node,
      deletedFiles: true,
    })

    expect(http.get).toHaveBeenCalledWith('/api/navigation')
    expect(http.delete).toHaveBeenCalledWith('/api/navigation/nodes/node-1')
    expect(http.delete).toHaveBeenCalledWith('/api/pages-config/orders')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/orders/rule.json')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/orders/pagedata.json')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/orders/script.js')
    expect(loader.clearCacheSpy).toHaveBeenCalledWith('/orders/style.css')
  })
})

describe('Page design 100-step flow', () => {
  it('keeps the flow complete, ordered and grouped by phase', () => {
    expect(PAGE_DESIGN_100_STEP_FLOW).toHaveLength(100)
    expect(PAGE_DESIGN_100_STEP_FLOW[0]).toMatchObject({ step: 1, phase: '入口' })
    expect(PAGE_DESIGN_100_STEP_FLOW.at(-1)).toMatchObject({ step: 100, phase: '收尾' })
    expect(PAGE_DESIGN_100_STEP_FLOW.map(item => item.step)).toEqual(
      Array.from({ length: 100 }, (_item, index) => index + 1),
    )

    const phases = summarizePageDesignFlowPhases()
    expect(phases[0]).toEqual({ phase: '入口', firstStep: 1, lastStep: 10, stepCount: 10 })
    expect(phases.at(-1)).toEqual({ phase: '收尾', firstStep: 100, lastStep: 100, stepCount: 1 })
    expect(getNextPageDesignFlowStep(88)).toMatchObject({ step: 89, phase: '结构' })
    expect(getNextPageDesignFlowStep(100)).toBeNull()
  })

  it('lets PageDesignService expose selected and phase-scoped flow context', () => {
    const service = new PageDesignService({ getEditHost: () => ({}) })
    const context = { pageId: 'orders', requestId: 'flow-test' }

    const selected = service.describeDesignFlow(context, { step: 40 })
    expect(selected.ok).toBe(true)
    if (!selected.ok) throw new Error(selected.msg)
    expect(selected.data.selectedStep).toMatchObject({ step: 40, phase: '最小表模型' })
    expect(selected.data.steps).toHaveLength(1)
    expect(selected.data.nextStep).toMatchObject({ step: 41, phase: '表关系' })

    const phase = service.describeDesignFlow(context, { phase: '数据利用', afterStep: 70 })
    expect(phase.ok).toBe(true)
    if (!phase.ok) throw new Error(phase.msg)
    expect(phase.data.steps).toHaveLength(10)
    expect(phase.data.steps[0]).toMatchObject({ step: 61, phase: '数据利用' })
    expect(phase.data.nextStep).toMatchObject({ step: 71, phase: '按需视图' })
  })
})

describe('DevSystem rule and pagedata edit policy', () => {
  const metadata: RuleEditorComponentMetadata = {
    types: ['r-table'],
    propNames: { 'r-table': ['dataViewKey', 'mode'] },
    propEnums: { 'r-table': { mode: ['compact', 'comfortable'] } },
    typeLabels: { 'r-table': '[表格] r-table' },
    requiredProps: { 'r-table': { dataViewKey: 'orders@default' } },
  }

  it('creates framework-free rule tree policy and schema from metadata', () => {
    const policy = createRuleTreePolicy(metadata)
    const schema = createRuleJsonSchema(metadata)

    expect(policy.getValueLabels?.(['type'])?.map(item => item.value)).toContain('r-table')
    expect(policy.getValueLabels?.(['type'])?.map(item => item.value)).toContain('div')
    expect(policy.getValueOptions?.(['props', 'mode'])).toEqual(['compact', 'comfortable'])
    expect(policy.getAutoPopulate?.(['type'], 'r-table')).toEqual([
      { targetPath: [], entries: { props: { dataViewKey: 'orders@default' } } },
    ])

    const defs = requireRecord(schema['$defs'], 'Expected schema $defs')
    const sparkNode = requireRecord(defs['sparkNode'], 'Expected sparkNode schema')
    const properties = requireRecord(sparkNode['properties'], 'Expected sparkNode properties')
    const typeProperty = requireRecord(properties['type'], 'Expected type property schema')
    expect(typeProperty['enum']).toEqual(['r-table'])
  })

  it('validates structured pagedata availability and designer projection roundtrip', () => {
    const metadataModel: DataSetMetadata = {
      dataSetName: 'OrdersDS',
      tables: {
        orders: {
          tableName: 'orders',
          resourceType: 'database',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } },
        },
      },
      tableRelations: [],
    }
    const uiState = reconcileDesignerTableUiState(metadataModel, [], () => 'generated-id')
    const tables = projectDesignerTables(metadataModel, uiState, () => 'unexpected')
    const relations = projectDesignerRelations(metadataModel)
    const rebuilt = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadataModel.dataSetName,
      tables,
      relations,
    })

    expect(canUseStructuredPageDataEditor(JSON.stringify(metadataModel))).toBe(true)
    expect(canUseStructuredPageDataEditor('{')).toBe(false)
    expect(rebuilt.tables['orders']?.columns[0]?.name).toBe('id')
    expect(rebuilt.layout?.tablePositions?.['orders']).toEqual({ x: 50, y: 50 })
  })
})
