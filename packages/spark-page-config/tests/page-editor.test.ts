import { describe, expect, it, vi } from 'vitest'
import { createRequest, type HttpClientBase } from '@spark-view/spark-utils'
import { PageEditor, createPageEditor, createPageEditorPreviewConfigLoader } from '@spark-view/spark-page-config/editor'
import type { DataSetCrudTool, SparkNodeTree } from '@spark-view/spark-data'
import {
  BasePageConfigLoader,
  PageConfigFileApi,
  type ConfigLoadResult,
  type PageConfig,
  type PageConfigFileLoadOptions,
  type PageConfigFileName,
  type PageDataConfig,
  type RuleConfig,
} from '@spark-view/spark-page-config/editor'
import {
  NavigationConfigClient,
  buildNavRoot,
  findNodeById,
  type AppNavRoot,
} from '@spark-view/spark-page-config/editor'

class TestPageConfigLoader extends BasePageConfigLoader {
  readonly loadPageFileContentSpy: (
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ) => Promise<ConfigLoadResult<string>>

  readonly clearCacheSpy = vi.fn()

  constructor(private readonly files: Partial<Record<string, string>>) {
    super()
    this.loadPageFileContentSpy = vi.fn(async (
      pageId: string,
      filename: PageConfigFileName,
      options?: PageConfigFileLoadOptions,
    ): Promise<ConfigLoadResult<string>> => {
      const key = `${pageId}/${filename}`
      if (!Object.hasOwn(this.files, key)) {
        return {
          success: false,
          error: `${key} not found`,
          reason: 'not-found',
          timestamp: options?.forceReload ? 2 : 1,
        }
      }
      return {
        success: true,
        data: this.files[key] ?? '',
        source: 'remote',
        timestamp: options?.forceReload ? 2 : 1,
      }
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

  override loadScript(pageId: string): Promise<ConfigLoadResult<string>> {
    return this.unsupported(pageId, 'script')
  }

  override loadCss(pageId: string): Promise<ConfigLoadResult<string>> {
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

function createPageFiles(pageId: string): Partial<Record<string, string>> {
  return {
    [`${pageId}/rule.json`]: `${JSON.stringify([{ id: 'root-child', type: 'div', props: { text: 'Alpha' } }], null, 2)}\n`,
    [`${pageId}/pagedata.json`]: `${JSON.stringify({
      dataSetName: 'EditorDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alpha' }],
            },
          },
        },
      },
    }, null, 2)}\n`,
    [`${pageId}/script.js`]: 'console.log("editor")\n',
    [`${pageId}/style.css`]: '.page { color: red; }\n',
  }
}

function createEditorHarness(options?: {
  files?: Partial<Record<string, string>>
  root?: AppNavRoot
}): {
  editor: PageEditor
  http: HttpClientBase
  loader: TestPageConfigLoader
  setRoot: (root: AppNavRoot) => void
} {
  const http = createHttpMock()
  const loader = new TestPageConfigLoader(options?.files ?? createPageFiles('orders'))
  const fileApi = new PageConfigFileApi({ getPageConfigApi: () => '/api/pages-config', http })
  const navigationClient = new NavigationConfigClient({ getNavigationApi: () => '/api/navigation', http })
  let root = options?.root ?? buildNavRoot([
    {
      id: 'orders-node',
      title: 'Orders',
      nodeKind: 'page',
      path: '/orders',
      order: 7,
      children: [{ id: 'child-node', title: 'Child', nodeKind: 'module' }],
    },
  ])

  vi.mocked(http.get).mockImplementation(async (url: string) => {
    if (url === '/api/navigation') return root
    if (url === '/api/pages-config/__list') return [{ pageId: 'orders', pageType: 'config' }]
    throw new Error(`Unexpected get ${url}`)
  })
  vi.mocked(http.put).mockImplementation(async (url: string, patch: unknown) => {
    if (url.startsWith('/api/navigation/nodes/')) {
      const nodeId = decodeURIComponent(url.slice('/api/navigation/nodes/'.length))
      const node = findNodeById(root.children, nodeId)
      if (!node) throw new Error(`Node not found: ${nodeId}`)
      Object.assign(node, patch)
      return { node }
    }
    return {}
  })

  return {
    editor: new PageEditor({
      fileApi,
      navigationClient,
      getConfigLoader: () => loader,
    }),
    http,
    loader,
    setRoot: (nextRoot) => {
      root = nextRoot
    },
  }
}

describe('PageEditor', () => {
  it('loads navigation and page files into one framework-free snapshot', async () => {
    const { editor } = createEditorHarness()

    await editor.loadNavigation()
    editor.selectNode('orders-node')
    await editor.selectPage({ allowMissingAsEmpty: true })

    const snapshot = editor.readSnapshot()
    expect(snapshot.pageId).toBe('orders')
    expect(snapshot.selectedNode?.id).toBe('orders-node')
    expect(snapshot.navigationDraft?.draft.title).toBe('Orders')
    expect(snapshot.nodeTree?.getNode({ componentId: 'root-child' })?.type).toBe('div')
    expect(snapshot.dataSetTool?.getTable('Orders')?.tableName).toBe('Orders')
    expect(snapshot.script).toContain('console.log("editor")')
    expect(snapshot.style).toContain('color: red')
    expect(snapshot.hasAnyDirty).toBe(false)
  })

  it('loads unmounted page files while keeping navigation selection empty', async () => {
    const { editor } = createEditorHarness({
      files: createPageFiles('draft-page'),
      root: buildNavRoot([]),
    })

    await editor.loadNavigation()
    await editor.selectPage('draft-page', { allowMissingAsEmpty: true })

    const snapshot = editor.readSnapshot()
    expect(snapshot.pageId).toBe('draft-page')
    expect(snapshot.selectedNode).toBeNull()
    expect(snapshot.navigationDraft).toBeNull()
    expect(snapshot.nodeTree).not.toBeNull()
    expect(snapshot.dataSetTool).not.toBeNull()
  })

  it('builds renderer preview config through the editor', async () => {
    const { editor } = createEditorHarness()
    await editor.loadNavigation()
    await editor.selectPage('orders', { allowMissingAsEmpty: true })

    const previewConfig = editor.buildPreviewConfig()

    expect(previewConfig?.rule[0]?.type).toBe('div')
    expect(previewConfig?.script).toBe('console.log("editor")\n')
    expect(previewConfig?.css).toBe('.page { color: red; }\n')
    expect(previewConfig?.data).toBeDefined()
  })

  it('fails preview config build with file parse errors surfaced by filename', async () => {
    const { editor } = createEditorHarness()
    await editor.loadNavigation()
    await editor.selectPage('orders', { allowMissingAsEmpty: true })

    editor.setPageFileText('rule.json', '{')

    expect(() => editor.buildPreviewConfig()).toThrow('rule.json:')
  })

  it('creates a preview loader that only delegates renderer HTTP access', () => {
    const http = createRequest()
    const loader = createPageEditorPreviewConfigLoader(http)

    expect(loader.getHttpClient()).toBe(http)
    expect(loader.getCacheStats()).toEqual({ size: 0, keys: [] })
  })

  it('creates workspace dependencies through the PageEditor factory', async () => {
    const http = createHttpMock()
    const loader = new TestPageConfigLoader(createPageFiles('orders'))
    const root = buildNavRoot([
      { id: 'orders-node', title: 'Orders', nodeKind: 'page', path: '/orders' },
    ])
    vi.mocked(http.get).mockImplementation(async (url: string) => {
      if (url === '/api/navigation') return root
      throw new Error(`Unexpected get ${url}`)
    })

    const editor = createPageEditor({
      http,
      getPageConfigApi: () => '/api/pages-config',
      getNavigationApi: () => '/api/navigation',
      createConfigLoader: () => loader,
    })

    await editor.loadNavigation()
    await editor.selectPage('orders', { allowMissingAsEmpty: true })

    expect(editor.readSnapshot().selectedNode?.id).toBe('orders-node')
    expect(editor.buildPreviewConfig()?.script).toBe('console.log("editor")\n')
  })

  it('commits DataSetCrudTool edits through pagedata.json dirty and revision notifications', async () => {
    const { editor } = createEditorHarness()
    await editor.loadNavigation()
    await editor.selectPage('orders', { allowMissingAsEmpty: true })
    const beforeRevision = editor.revision

    await editor.editDataSet((tool: DataSetCrudTool) => {
      tool.createTable({
        tableName: 'Customers',
        columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
        views: { default: { rows: [] } },
      })
    })

    expect(editor.revision).toBeGreaterThan(beforeRevision)
    expect(editor.readSnapshot().dirtyFiles.has('pagedata.json')).toBe(true)
    expect(editor.readSnapshot().pageDataJson).toContain('"Customers"')
  })

  it('waits for async DataSetCrudTool edits before notifying pagedata.json text projection', async () => {
    const { editor } = createEditorHarness()
    await editor.loadNavigation()
    await editor.selectPage('orders', { allowMissingAsEmpty: true })

    await editor.editDataSet(async (tool: DataSetCrudTool) => {
      await tool.createRow({
        tableName: 'Orders',
        data: { id: 2, name: 'Beta' },
        viewId: 'default',
      })
    })

    expect(editor.readSnapshot().pageDataJson).toContain('"Beta"')
    expect(editor.readSnapshot().dirtyFiles.has('pagedata.json')).toBe(true)
  })

  it('commits SparkNodeTree edits through rule.json dirty and revision notifications', async () => {
    const { editor } = createEditorHarness()
    await editor.loadNavigation()
    await editor.selectPage('orders', { allowMissingAsEmpty: true })
    const beforeRevision = editor.revision

    await editor.editNodeTree((tree: SparkNodeTree) => {
      tree.setProps({
        componentId: 'root-child',
        props: { text: 'Updated' },
      })
    })

    expect(editor.revision).toBeGreaterThan(beforeRevision)
    expect(editor.readSnapshot().dirtyFiles.has('rule.json')).toBe(true)
    expect(editor.readSnapshot().ruleJson).toContain('"Updated"')
  })

  it('saves selected navigation node without children or order in the patch', async () => {
    const { editor, http } = createEditorHarness()
    await editor.loadNavigation()
    editor.selectNode('orders-node')
    const draft = editor.readSnapshot().navigationDraft
    if (!draft) throw new Error('Expected navigation draft')
    draft.draft.title = 'Orders Updated'
    editor.applyNavigationDraft(draft)

    await editor.saveSelectedNavigationNode()

    const updateCall = vi.mocked(http.put).mock.calls.find(([url]) => url === '/api/navigation/nodes/orders-node')
    expect(updateCall).toBeDefined()
    const patch: Record<string, unknown> = Object.assign({}, updateCall?.[1])
    expect(patch['title']).toBe('Orders Updated')
    expect(patch).not.toHaveProperty('children')
    expect(patch).not.toHaveProperty('order')
  })

  it('rolls back created page files when binding the selected navigation node fails', async () => {
    const { editor, http, setRoot } = createEditorHarness({
      root: buildNavRoot([{ id: 'module-node', title: 'Module', nodeKind: 'module' }]),
    })
    setRoot(buildNavRoot([{ id: 'module-node', title: 'Module', nodeKind: 'module' }]))
    vi.mocked(http.post).mockResolvedValueOnce({ created: true })
    vi.mocked(http.put).mockRejectedValueOnce(new Error('navigation-save-failed'))
    vi.mocked(http.delete).mockResolvedValueOnce({})

    await editor.loadNavigation()
    editor.selectNode('module-node')

    await expect(editor.createPageForSelectedNode({
      pageId: 'new-page',
      title: 'New Page',
      icon: 'Document',
    })).rejects.toThrow('navigation-save-failed')

    expect(http.post).toHaveBeenCalledWith('/api/pages-config/__create', {
      pageId: 'new-page',
      title: 'New Page',
      icon: 'Document',
    })
    expect(http.delete).toHaveBeenCalledWith('/api/pages-config/new-page')
  })
})
