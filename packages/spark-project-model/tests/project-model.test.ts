import { describe, expect, it } from 'vitest'
import type { ProjectModelData, ProjectNodeData } from '@spark-appworks/spark-project-model'
import type { HttpClientBase, HttpResponse } from '@spark-appworks/spark-utils'
import {
  ConfigPageNode,
  ConfigSubPageNode,
  ModuleNode,
  resolvePageDesignSurface,
  SystemDirectoryNode,
  VueComponentPageNode,
} from '@spark-appworks/spark-project-model'
import { createProjectEditor, type ProjectEditor } from '@spark-appworks/spark-project-model/project'
import { createRequest } from '@spark-appworks/spark-utils'
import { createNavigationNodePatch } from '../src/model/navigation/edit'

describe('ProjectModel', () => {
  function createRoot(children: ProjectNodeData[], childPlacement: 'header' | 'sidebar' = 'header'): ProjectModelData {
    return {
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement,
      children,
    }
  }

  function createEditor(): ProjectEditor {
    const http = createRequest()
    return createProjectEditor({
      projectId: 'crm',
      http,
      getPageFilesApi: () => '/api/pages-config',
      getNavigationApi: () => '/api/navigation',
      fileStorage: 'memory',
    })
  }

  it('resolves page design surface by nodeKind', () => {
    expect(resolvePageDesignSurface({ id: 'p', title: 'P', nodeKind: 'page', path: '/p' })).toBe('config-files')
    expect(resolvePageDesignSurface({ id: 's', title: 'S', nodeKind: 'system-page', path: '/dashboard' })).toBe('vue-component')
    expect(resolvePageDesignSurface({ id: 'l', title: 'L', nodeKind: 'link', path: '/ext' })).toBe('link')
  })

  it('maps system-page nodes to VueComponentPageNode', () => {
    const p = createEditor().project
    p.replaceRoot(createRoot([
      { id: 'dashboard', title: '仪表盘', nodeKind: 'system-page', path: '/dashboard' },
    ]))
    const node = p.findNodeById('dashboard')
    expect(node).toBeInstanceOf(VueComponentPageNode)
    const summaries = p.readPageSummaries()
    expect(summaries[0]?.designSurface).toBe('vue-component')
  })

  it('maps system-directory nodes to SystemDirectoryNode class', () => {
    const p = createEditor().project
    p.replaceRoot({
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement: 'header',
      children: [
        {
          id: 'toolbar-root',
          title: '工具栏',
          nodeKind: 'system-directory',
          childPlacement: 'toolbar',
          children: [{ id: 'refresh', title: '刷新', nodeKind: 'system-action' }],
        },
      ],
    })
    const toolbarRoot = p.findNodeById('toolbar-root')
    expect(toolbarRoot).toBeInstanceOf(SystemDirectoryNode)
    expect(toolbarRoot?.family).toBe('module')
  })

  it('exposes design and runtime class aggregates on project root', () => {
    const p = createEditor().project
    expect(p.design).toBeDefined()
    expect(p.runtime).toBeDefined()
    expect(p.design.navigation).toBe(p.design.navigation)
    p.design.navigation.replaceRoot(createRoot([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ]))
    expect(p.design.findConfigPageByPageId('orders')).toBeInstanceOf(ConfigPageNode)
    expect(p.runtime.listLoadedPages()).toEqual([])
    expect(p.runtime.readPageRuntimeStats()).toEqual({ openCount: 1, loadedCount: 0 })
    expect(p.runtime.findOpenPage('orders')?.pageId).toBe('orders')
    expect(p.runtime.findLoadedPage('orders')).toBeNull()
    expect(p.runtime.findRenderConfig('orders')).toBeNull()
  })

  it('finds pages by pageId from the tree', () => {
    const p = createEditor().project
    p.replaceRoot(createRoot([{
      id: 'orders-node', title: '订单页面', nodeKind: 'page', path: '/orders',
      children: [{ id: 'order-detail', title: '订单详情', nodeKind: 'sub-page', description: '订单详情功能' }],
    }]))
    const page = p.findConfigPageByPageId('orders')
    const sub = p.findConfigPageByPageId('order-detail')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(page).not.toBeInstanceOf(ConfigSubPageNode)
    expect(sub).toBeInstanceOf(ConfigSubPageNode)
    expect(page?.nodeKind).toBe('page')
    expect(sub?.nodeKind).toBe('sub-page')
    expect(sub?.pageId).toBe('order-detail')
  })

  it('builds tree from flat collection and finds nodes', () => {
    const p = createEditor().project
    p.replaceRoot(createRoot([
      { id: 'sales', title: '销售模块', nodeKind: 'module', description: '销售模块', children: [
        { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders', description: '订单页面' },
      ]},
    ]))
    const tree = p.navigationRoot.children
    expect(tree.length).toBeGreaterThanOrEqual(1)
    const salesNode = p.findNodeById('sales')
    expect(salesNode).toBeInstanceOf(ModuleNode)
    expect(salesNode?.family).toBe('module')
    expect(salesNode?.description).toBe('销售模块')
    const orderNode = p.findNodeById('orders')
    expect(orderNode).toBeInstanceOf(ConfigPageNode)
  })

  it('exposes node hierarchy instead of a flat node list', () => {
    const p = createEditor().project
    p.replaceRoot(createRoot([
      { id: 'sales', title: '销售模块', nodeKind: 'module', children: [
        { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
      ]},
      { id: 'settings', title: '设置', nodeKind: 'page', path: '/settings' },
    ]))

    expect(p.family).toBe('project')
    expect(p.name).toBe('crm')
    const rootNodes = p.getChildNodes('')
    expect(rootNodes.map(node => node.id)).toEqual(['homepage_root'])
    expect(rootNodes.map(node => node.pid)).toEqual([''])
    expect(rootNodes[0]).toBeInstanceOf(ModuleNode)
    expect(rootNodes[0]?.family).toBe('module')
    const root = rootNodes[0]
    expect(root?.title).toBe('CRM')
    expect(root?.childPlacement).toBe('header')
    expect(root ? p.getChildNodes(root.id).map(node => node.id) : []).toEqual(['sales', 'settings'])
    const sales = p.findNodeById('sales')
    expect(sales ? p.getChildNodes(sales.id).map(node => node.id) : []).toEqual(['orders'])
    const settings = p.findNodeById('settings')
    expect(settings).toBeInstanceOf(ConfigPageNode)
    expect(settings instanceof ConfigPageNode ? p.getChildNodes(settings.id) : []).toEqual([])
    expect(p.findNodeById('sales')?.toNodeData()).toMatchObject({ nodeKind: 'module' })
  })

  it('uses a real project node as the project home node and keeps placement on root', () => {
    const p = createEditor().project
    p.replaceRoot(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
    ], 'sidebar'))
    p.replaceProjectInfo({ homeNodeId: 'orders' })

    expect(p.homeNodeId).toBe('orders')
    expect(p.homeNode).toBe(p.findNodeById('orders'))
    expect(p.projectInfo.homeNodeId).toBe('orders')
    expect(p.navigationRoot.childPlacement).toBe('sidebar')
    expect(p.rootNode?.id).toBe('homepage_root')
  })

  it('promotes a persisted root node returned as the only top-level child', () => {
    const p = createEditor().project
    p.replaceRoot({ title: '', childPlacement: 'header', children: [{
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement: 'sidebar',
      children: [{ id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' }],
    }]})

    expect(p.rootNode?.id).toBe('homepage_root')
    expect(p.getChildNodes('').map(node => node.id)).toEqual(['homepage_root'])
    expect(p.getChildNodes('homepage_root').map(node => node.id)).toEqual(['orders'])
    expect(p.navigationRoot.children.map(node => node.id)).toEqual(['orders'])
  })

  it('promotes a persisted module root even when root childPlacement is missing', () => {
    const p = createEditor().project
    p.replaceRoot({ title: '', childPlacement: 'header', children: [{
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      children: [{ id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' }],
    }]})

    expect(p.rootNode?.id).toBe('homepage_root')
    expect(p.navigationRoot.childPlacement).toBe('header')
    expect(p.navigationRoot.children.map(node => node.id)).toEqual(['orders'])
  })

  it('promotes persisted root from mixed top-level rows and merges siblings under it', () => {
    const p = createEditor().project
    p.replaceRoot({ title: '', childPlacement: 'header', children: [
      {
        id: 'homepage_root',
        title: '',
        nodeKind: 'module',
        childPlacement: 'header',
        children: [{ id: 'home', title: '企业管理平台', nodeKind: 'system-page', path: '/home' }],
      },
      { id: 'app-list', title: '应用管理', nodeKind: 'system-page', path: '/app-list' },
    ]})

    expect(p.rootNode?.id).toBe('homepage_root')
    expect(p.getChildNodes('').map(node => node.id)).toEqual(['homepage_root'])
    expect(p.getChildNodes('homepage_root').map(node => node.id)).toEqual(['app-list', 'home'])
    expect(p.navigationRoot.children.map(node => node.id)).toEqual(['app-list', 'home'])
  })

  it('supports detached config pages', () => {
    const p = createEditor().project
    const page = p.design.openConfigPage('standalone')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(page.design.rule).toBe(page.rule)
    expect(page.runtime.isLoaded).toBe(false)
    expect(page.pageId).toBe('standalone')
    expect(p.design.findConfigPageByPageId('standalone')).toBe(page)
    expect(p.findNodeById('standalone')).toBeNull()
  })

  it('creates full navigation patch so editable fields can be cleared', () => {
    const result = createNavigationNodePatch({
      node: {
        id: 'orders',
        title: '订单',
        icon: '',
        nodeKind: 'page',
        dividerAfter: false,
        description: '',
        path: '',
        linkTarget: 'iframe',
        childPlacement: '',
        order: 0,
        hidden: false,
        disabled: false,
        refId: '',
        permissionMode: 'masked',
      },
      context: {
        hasContext: true,
        items: [{ id: '', title: '' }],
        config: { placeholder: '', defaultValue: '', paramName: '' },
      },
    })

    expect(result.patch).toMatchObject({
      title: '订单',
      icon: '',
      description: '',
      path: '',
      context: '',
      hidden: false,
      disabled: false,
      dividerAfter: false,
      order: 0,
    })
  })

  it('moves mounted pages through the dedicated move endpoint', async () => {
    const putCalls: Array<{ url: string; body: unknown }> = []
    const root: ProjectModelData = {
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement: 'header' as const,
      children: [
        { id: 'orders', title: '订单', nodeKind: 'page' as const, path: '/orders' },
      ],
    }
    const movedNode: ProjectNodeData = { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders', order: 0 }
    const http = {
      get: async <T = unknown>() => root as T,
      put: async <T = unknown>(url: string, body: unknown) => {
        putCalls.push({ url, body })
        return { node: movedNode } as T
      },
      post: async <T = unknown>() => ({ node: movedNode } as T),
      delete: async <T = unknown>() => ({ deleted: { id: 'orders', title: '订单' } } as T),
      requestFull: async <T = unknown>(): Promise<HttpResponse<T>> => ({
        data: {} as T,
        status: 200,
        statusText: 'OK',
        headers: {},
      }),
      clearCache: () => {},
    } as unknown as HttpClientBase
    const editor = createProjectEditor({
      projectId: 'crm',
      http,
      getPageFilesApi: () => '/api/pages-config',
      getNavigationApi: () => '/api/navigation',
    })

    await editor.loadNavigation()
    await editor.moveMountedPage('orders', null, 0)

    expect(putCalls).toEqual([
      { url: '/api/navigation/nodes/orders/move', body: { newParentId: null, index: 0 } },
    ])
  })
})
