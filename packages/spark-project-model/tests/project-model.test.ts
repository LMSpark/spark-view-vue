import { describe, expect, it } from 'vitest'
import type { ProjectModelData, ProjectNodeData } from '../src/navigation/project-node'
import type { HttpClientBase, HttpResponse } from '@spark-appworks/spark-utils'
import {
  ModuleNode,
  SystemPageNode,
  SystemDirectoryNode,
} from '../src/navigation/navigation-kinds'
import { ConfigPageNode } from '../src/page/config-page'
import { ConfigSubPageNode } from '../src/page/config-page'
import { resolveProjectPageSurface } from '../src/navigation/navigation-tree'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { createRequest } from '@spark-appworks/spark-utils'
import { createNavigationNodePatch } from '../src/navigation/navigation-edit'

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

  function createWorkspace(): ProjectWorkspace {
    const http = createRequest()
    return new ProjectWorkspace({
      projectId: 'crm',
      http,
      getPageFilesApi: () => '/api/pages-config',
      getNavigationApi: () => '/api/navigation',
      fileStorage: 'memory',
    })
  }

  it('resolves page design surface by nodeKind', () => {
    expect(resolveProjectPageSurface({ id: 'p', title: 'P', nodeKind: 'page', path: '/p' })).toBe('config-files')
    expect(resolveProjectPageSurface({ id: 's', title: 'S', nodeKind: 'system-page', path: '/dashboard' })).toBe('system-page')
    expect(resolveProjectPageSurface({ id: 'l', title: 'L', nodeKind: 'link', path: '/ext' })).toBe('link')
  })

  it('maps system-page nodes to SystemPageNode', () => {
    const p = createWorkspace().project
    p.replaceNavigationRoot(createRoot([
      { id: 'dashboard', title: '仪表盘', nodeKind: 'system-page', path: '/dashboard' },
    ]))
    const node = p.findNodeById('dashboard')
    expect(node).toBeInstanceOf(SystemPageNode)
    const summaries = p.readPageSummaries()
    expect(summaries[0]?.designSurface).toBe('system-page')
  })

  it('maps system-directory nodes to SystemDirectoryNode class', () => {
    const p = createWorkspace().project
    p.replaceNavigationRoot({
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

  it('exposes the design aggregate on project root', () => {
    const p = createWorkspace().project
    expect(p.design).toBeDefined()
    expect(p.design.navigation).toBe(p.design.navigation)
    p.design.navigation.replaceNavigationRoot(createRoot([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ]))
    expect(p.design.findConfigPageByPageId('orders')).toBeInstanceOf(ConfigPageNode)
    expect(p.findConfigPageByPageId('orders')?.pageId).toBe('orders')
  })

  it('finds pages by pageId from the tree', () => {
    const p = createWorkspace().project
    p.replaceNavigationRoot(createRoot([{
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
    expect(sub?.isSubPage).toBe(true)
    expect(sub?.toSummary().designSurface).toBe('config-files')
    expect(sub?.toSummary().nodeKind).toBe('sub-page')
  })

  it('builds tree from flat collection and finds nodes', () => {
    const p = createWorkspace().project
    p.replaceNavigationRoot(createRoot([
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

  it('keeps ProjectNodeData copies from mutating the node class', () => {
    const p = createWorkspace().project
    p.replaceNavigationRoot(createRoot([
      {
        id: 'orders',
        title: '订单页面',
        nodeKind: 'page',
        path: '/orders',
        context: [{ id: 'tenant-a', title: '租户 A' }],
      },
    ]))

    const node = p.findNodeById('orders')
    const data = node?.toNodeData()
    if (data) {
      data.title = '被外部改掉'
      if (Array.isArray(data.context)) data.context[0]!.title = '租户 B'
    }

    expect(node?.title).toBe('订单页面')
    expect(Array.isArray(node?.context) ? node.context[0]?.title : '').toBe('租户 A')
  })

  it('applies navigation edits through the model class and refreshes cached tree projections', () => {
    const workspace = createWorkspace()
    workspace.project.replaceNavigationRoot(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders', order: 0 },
      { id: 'reports', title: '报表', nodeKind: 'page', path: '/reports', order: 1 },
    ]))
    workspace.project.selectNode('orders')
    expect(workspace.project.readNavigationProjection().treeData.map(node => node.id)).toEqual(['orders', 'reports'])

    const dto = workspace.project.beginNavigationDraft()
    dto.node.title = '销售订单'
    dto.node.order = 2
    workspace.project.applyNavigationNodeEdit(dto)

    const projection = workspace.project.readNavigationProjection()
    expect(workspace.project.findNodeById('orders')?.title).toBe('销售订单')
    expect(projection.selectedNode?.title).toBe('销售订单')
    expect(projection.treeData.map(node => node.id)).toEqual(['reports', 'orders'])
  })

  it('exposes node hierarchy instead of a flat node list', () => {
    const p = createWorkspace().project
    p.replaceNavigationRoot(createRoot([
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
    const p = createWorkspace().project
    p.replaceNavigationRoot(createRoot([
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
    const p = createWorkspace().project
    p.replaceNavigationRoot({ title: '', childPlacement: 'header', children: [{
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
    const p = createWorkspace().project
    p.replaceNavigationRoot({ title: '', childPlacement: 'header', children: [{
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
    const p = createWorkspace().project
    p.replaceNavigationRoot({ title: '', childPlacement: 'header', children: [
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
    const p = createWorkspace().project
    const page = p.design.openPageDesign('standalone')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(page.rule).toBeDefined()
    expect(page.isLoaded).toBe(false)
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
    const workspace = new ProjectWorkspace({
      projectId: 'crm',
      http,
      getPageFilesApi: () => '/api/pages-config',
      getNavigationApi: () => '/api/navigation',
    })

    await workspace.loadNavigation()
    await workspace.moveMountedPage('orders', null, 0)

    expect(putCalls).toEqual([
      { url: '/api/navigation/nodes/orders/move', body: { newParentId: null, index: 0 } },
    ])
  })
})
