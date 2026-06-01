import { describe, expect, it } from 'vitest'
import { ConfigPageNode, ModuleNode } from '@spark-view/spark-project-model'
import { createProjectEditor, type ProjectEditor } from '@spark-view/spark-project-model/project'
import { createRequest } from '@spark-view/spark-utils'
import { createNavigationNodePatch } from '../src/service/navigation/editing.service'

describe('ProjectModel', () => {
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

  it('finds pages by pageId from the tree', () => {
    const p = createEditor().project
    p.nodes.replaceRoot({ childPlacement: 'header', children: [{
      id: 'orders-node', title: '订单页面', nodeKind: 'page', path: '/orders',
      children: [{ id: 'order-detail', title: '订单详情', nodeKind: 'sub-page', description: '订单详情功能' }],
    }]})
    const page = p.nodes.findConfigPageByPageId('orders')
    const sub = p.nodes.findConfigPageByPageId('order-detail')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(sub).toBeInstanceOf(ConfigPageNode)
    expect(page?.nodeKind).toBe('page')
    expect(sub?.nodeKind).toBe('sub-page')
    expect(sub?.pageId).toBe('order-detail')
  })

  it('builds tree from flat collection and finds nodes', () => {
    const p = createEditor().project
    p.nodes.replaceRoot({ childPlacement: 'header', children: [
      { id: 'sales', title: '销售模块', nodeKind: 'module', description: '销售模块', children: [
        { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders', description: '订单页面' },
      ]},
    ]})
    const tree = p.nodes.toTree()
    expect(tree.length).toBeGreaterThanOrEqual(1)
    const salesNode = p.nodes.findNodeById('sales')
    expect(salesNode).toBeInstanceOf(ModuleNode)
    expect(salesNode?.description).toBe('销售模块')
    const orderNode = p.nodes.findNodeById('orders')
    expect(orderNode).toBeInstanceOf(ConfigPageNode)
  })

  it('supports detached config pages', () => {
    const p = createEditor().project
    const page = p.nodes.openConfigPage('standalone')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(page.pageId).toBe('standalone')
    expect(page.navigation.navNode).toBeNull()
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
    const root = {
      childPlacement: 'header' as const,
      children: [
        { id: 'orders', title: '订单', nodeKind: 'page' as const, path: '/orders' },
      ],
    }
    const editor = createProjectEditor({
      projectId: 'crm',
      http: {
        get: async () => root,
        put: async (url: string, body: unknown) => {
          putCalls.push({ url, body })
          return { node: { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders', order: 0 } }
        },
        post: async () => ({ node: { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' } }),
        delete: async () => ({ deleted: { id: 'orders', title: '订单' } }),
        requestFull: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config: {} }),
        clearCache: () => {},
      },
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
