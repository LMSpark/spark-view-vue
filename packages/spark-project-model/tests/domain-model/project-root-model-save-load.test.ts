import { describe, expect, it, vi } from 'vitest'
import type { NavigationClient } from '../../src/io/navigation-client'
import type { ProjectModelData } from '../../src/navigation/project-node'
import {
  NavigationRowModel,
  ProjectRootModel,
} from '../../src/index.js'

const sampleRoot: ProjectModelData = {
  id: 'demo',
  title: 'Demo Project',
  nodeKind: 'module',
  childPlacement: 'header',
  children: [
    {
      id: 'page-home',
      title: 'Home',
      nodeKind: 'page',
      path: '/page-home',
    },
  ],
}

function createMockClient(overrides: Partial<NavigationClient> = {}): NavigationClient {
  return {
    loadRoot: vi.fn().mockResolvedValue(sampleRoot),
    addNode: vi.fn().mockResolvedValue({ id: 'page-new', title: 'New', nodeKind: 'page' }),
    updateNode: vi.fn().mockResolvedValue({ id: 'page-home', title: 'Home', nodeKind: 'page' }),
    deleteNode: vi.fn().mockResolvedValue(null),
    moveNode: vi.fn(),
    probeLink: vi.fn(),
    ...overrides,
  } as unknown as NavigationClient
}

describe('ProjectRootModel save/load', () => {
  it('load hydrates flat navigation rows from NavigationClient.loadRoot', async () => {
    const client = createMockClient()
    const project = await ProjectRootModel.load({
      projectId: 'demo',
      tenantId: 'tenant-1',
      client,
    })

    expect(client.loadRoot).toHaveBeenCalledTimes(1)
    expect(project.name).toBe('Demo Project')
    expect(project.navigationNodes.map((row) => row.id)).toEqual(['demo', 'page-home'])
    expect(project.findNavigationNode('page-home')?.title).toBe('Home')
  })

  it('save flushes add/update/remove pending ops via NavigationClient', async () => {
    const client = createMockClient()
    const project = new ProjectRootModel({
      projectId: 'demo',
      name: 'Demo',
      tenantId: 'tenant-1',
      navigationNodes: [
        new NavigationRowModel({
          id: 'demo',
          parentId: '',
          projectId: 'demo',
          tenantId: 'tenant-1',
          title: 'Demo',
          nodeKind: 'module',
        }),
        new NavigationRowModel({
          id: 'page-home',
          parentId: 'demo',
          projectId: 'demo',
          tenantId: 'tenant-1',
          title: 'Home',
          nodeKind: 'page',
        }),
      ],
    })

    project.updateNavigationNode('page-home', { title: 'Home Updated' })
    project.addNavigationNode(
      new NavigationRowModel({
        id: 'page-about',
        parentId: 'demo',
        projectId: 'demo',
        tenantId: 'tenant-1',
        title: 'About',
        nodeKind: 'page',
      }),
    )
    project.removeNavigationNode('page-about')

    await project.save({ client })

    expect(client.updateNode).toHaveBeenCalledWith(
      'page-home',
      expect.objectContaining({ title: 'Home Updated' }),
    )
    expect(client.addNode).not.toHaveBeenCalled()
    expect(client.deleteNode).not.toHaveBeenCalled()
    expect(project.dirty).toBe(false)
  })

  it('save issues add and delete when nodes are created then removed before flush', async () => {
    const client = createMockClient()
    const project = new ProjectRootModel({
      projectId: 'demo',
      name: 'Demo',
      tenantId: 'tenant-1',
    })

    project.addNavigationNode(
      new NavigationRowModel({
        id: 'page-temp',
        parentId: '',
        projectId: 'demo',
        tenantId: 'tenant-1',
        title: 'Temp',
      }),
    )
    project.removeNavigationNode('page-temp')

    await project.save({ client })

    expect(client.addNode).not.toHaveBeenCalled()
    expect(client.deleteNode).not.toHaveBeenCalled()
    expect(project.dirty).toBe(false)
  })
})
