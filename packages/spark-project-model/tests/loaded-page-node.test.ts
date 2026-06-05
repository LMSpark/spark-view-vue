import { describe, expect, it } from 'vitest'
import { LoadedPageNode } from '@spark-appworks/spark-project-model'
import { ConfigPageNode } from '@spark-appworks/spark-project-model'
import { PageContentRepository } from '../src/io/page-content-repository'
import { createInMemoryProjectModelIoPorts } from '../src/model/project/ports'

describe('LoadedPageNode', () => {
  it('delegates load to repository and toRenderConfig to domain node', async () => {
    const node = new ConfigPageNode({
      node: { id: 'demo', title: 'Demo', nodeKind: 'page', path: '/demo' },
      pid: '',
      pageId: 'demo',
    })
    const repository = new PageContentRepository(createInMemoryProjectModelIoPorts())
    const loaded = new LoadedPageNode(node, repository)

    expect(loaded.pageId).toBe('demo')
    expect(loaded.isLoaded).toBe(false)

    await loaded.load()
    expect(loaded.isLoaded).toBe(true)
    expect(loaded.toRenderConfig().pageId).toBe('demo')
  })
})
