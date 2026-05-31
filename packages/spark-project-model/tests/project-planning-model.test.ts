import { describe, expect, it } from 'vitest'
import { ProjectModel, ConfigPageNode, ModuleNode } from '@spark-view/spark-project-model'
import { createRequest } from '@spark-view/spark-utils'
import { buildNavRoot } from '../src/service/navigation/editing'
import { PageNodeFileApi } from '../src/service/file/page-file-api'
import { PageNodeFileCache } from '../src/service/file/page-file-cache'
import { PageContentLoader } from '../src/service/loader/page-content-loader'

describe('ProjectModel', () => {
  function createProject(desc?: string): ProjectModel {
    const http = createRequest()
    const l = new PageContentLoader({ fileStorage: 'memory', httpClient: http })
    return new ProjectModel({
      projectId: 'crm',
      fileApi: new PageNodeFileApi({ getPageFilesApi: () => '/api/pages-config', http }),
      fileCache: new PageNodeFileCache({ contentLoaderFactory: () => l }),
      contentLoaderFactory: () => l,
      ...(desc === undefined ? {} : { projectRequirement: desc }),
    })
  }

  it('finds pages by pageId from the tree', () => {
    const p = createProject()
    p.nodes.replaceRoot(buildNavRoot([{
      id: 'orders-node', title: '订单页面', nodeKind: 'page', path: '/orders',
      children: [{ id: 'order-detail', title: '订单详情', nodeKind: 'sub-page', description: '订单详情功能' }],
    }]))
    const page = p.nodes.findConfigPageByPageId('orders')
    const sub = p.nodes.findConfigPageByPageId('order-detail')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(sub).toBeInstanceOf(ConfigPageNode)
    expect(page?.nodeKind).toBe('page')
    expect(sub?.nodeKind).toBe('sub-page')
    expect(sub?.pageId).toBe('order-detail')
  })

  it('builds tree from flat collection and finds nodes', () => {
    const p = createProject()
    p.nodes.replaceRoot(buildNavRoot([
      { id: 'sales', title: '销售模块', nodeKind: 'module', description: '销售模块', children: [
        { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders', description: '订单页面' },
      ]},
    ]))
    const tree = p.nodes.toTree()
    expect(tree.length).toBeGreaterThanOrEqual(1)
    const salesNode = p.nodes.findNodeById('sales')
    expect(salesNode).toBeInstanceOf(ModuleNode)
    expect(salesNode?.description).toBe('销售模块')
    const orderNode = p.nodes.findNodeById('orders')
    expect(orderNode).toBeInstanceOf(ConfigPageNode)
  })

  it('supports detached config pages', () => {
    const p = createProject()
    const page = p.nodes.openConfigPage('standalone')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(page.pageId).toBe('standalone')
    expect(page.navigation.navNode).toBeNull()
  })
})
