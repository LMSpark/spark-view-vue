import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '@spark-view/spark-utils'
import type { DataSetMetadata } from '@spark-view/spark-data'
import {
  NavigationConfigClient,
  PageConfigEditWorkspace,
  PageConfigFileApi,
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
  normalizeNavRoot,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type AppNavRoot,
  type ConfigLoadResult,
  type ConfigLoader,
  type NavNode,
  type RuleEditorComponentMetadata,
} from '@spark-view/spark-page-config'

function createHttpMock(): HttpClient {
  return {
    interceptors: {
      request: { use: vi.fn(() => () => undefined) },
      response: { use: vi.fn(() => () => undefined) },
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

function createLoader(files: Partial<Record<string, string>>): ConfigLoader {
  const loadPageFileContent = vi.fn(async (pageId: string, filename: string, options?: { forceReload?: boolean }) => {
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

  return {
    loadPageConfig: vi.fn(),
    loadRule: vi.fn(),
    loadPageData: vi.fn(),
    loadScript: vi.fn(),
    loadCss: vi.fn(),
    loadPageFileContent,
    clearCache: vi.fn(),
    getCacheStats: vi.fn(() => ({ size: 0, keys: [] })),
  }
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

    expect(loader.loadPageFileContent).toHaveBeenCalledTimes(4)
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
    expect(loader.clearCache).toHaveBeenCalledWith('/orders/script.js')
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
    expect(loader.loadPageFileContent).toHaveBeenCalledWith('orders', 'script.js', { forceReload: true })
    expect(workspace.documents['script.js'].text.value).toBe('console.log("restored")')
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
