import { describe, expect, it, vi } from 'vitest'
import { NavigationRowModel } from '../../src/domain-model/navigation/navigation-row-model'
import type { NavigationClient } from '../../src/io/navigation-client'

describe('NavigationRowModel.save', () => {
  it('updates existing node via NavigationClient', async () => {
    const updateNode = vi.fn().mockResolvedValue({ id: 'n1', title: 'T' })
    const client = { updateNode, addNode: vi.fn() } as unknown as NavigationClient

    const row = new NavigationRowModel({
      id: 'n1',
      parentId: 'root',
      projectId: 'demo',
      tenantId: 't1',
      title: 'New Title',
      description: 'desc',
      nodeKind: 'page',
    })

    await row.save({ client })

    expect(updateNode).toHaveBeenCalledWith('n1', {
      title: 'New Title',
      description: 'desc',
      nodeKind: 'page',
    })
    expect(client.addNode).not.toHaveBeenCalled()
  })

  it('creates node when create flag is set', async () => {
    const addNode = vi.fn().mockResolvedValue({ id: 'n2', title: 'X' })
    const client = { addNode, updateNode: vi.fn() } as unknown as NavigationClient

    const row = new NavigationRowModel({
      id: 'n2',
      parentId: '',
      projectId: 'demo',
      tenantId: 't1',
      title: 'X',
      nodeKind: 'page',
    })

    await row.save({ client, create: true })

    expect(addNode).toHaveBeenCalledOnce()
    expect(addNode.mock.calls[0]?.[0]?.node?.id).toBe('n2')
  })
})
