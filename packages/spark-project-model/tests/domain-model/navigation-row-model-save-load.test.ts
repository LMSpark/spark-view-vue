import { describe, expect, it, vi } from 'vitest'
import type { NavigationClient } from '../../src/io/navigation-client'
import type { ProjectModelData } from '../../src/navigation/project-node'
import { NavigationRowModel } from '../../src/index.js'

const sampleRoot: ProjectModelData = {
  id: 'demo',
  title: 'Demo',
  nodeKind: 'module',
  childPlacement: 'header',
  children: [
    {
      id: 'page-home',
      title: 'Home',
      nodeKind: 'page',
      description: 'Landing',
    },
  ],
}

describe('NavigationRowModel save/load', () => {
  it('save calls NavigationClient.updateNode with row patch', async () => {
    const updateNode = vi.fn().mockResolvedValue({ id: 'page-home', title: 'Home', nodeKind: 'page' })
    const client = { updateNode } as unknown as NavigationClient

    const row = new NavigationRowModel({
      id: 'page-home',
      parentId: 'demo',
      projectId: 'demo',
      tenantId: 'tenant-1',
      title: 'Home Renamed',
      description: 'Landing',
      nodeKind: 'page',
    })

    await row.save({ client })

    expect(updateNode).toHaveBeenCalledWith(
      'page-home',
      expect.objectContaining({ title: 'Home Renamed', description: 'Landing' }),
    )
  })

  it('load finds a row by id from NavigationClient.loadRoot', async () => {
    const client = {
      loadRoot: vi.fn().mockResolvedValue(sampleRoot),
    } as unknown as NavigationClient

    const row = await NavigationRowModel.load({
      id: 'page-home',
      projectId: 'demo',
      tenantId: 'tenant-1',
      client,
    })

    expect(row.id).toBe('page-home')
    expect(row.title).toBe('Home')
    expect(row.description).toBe('Landing')
  })
})
