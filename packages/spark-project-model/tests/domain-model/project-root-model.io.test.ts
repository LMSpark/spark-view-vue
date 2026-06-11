import { describe, expect, it, vi } from 'vitest'
import { NavigationRowModel } from '../../src/domain-model/navigation/navigation-row-model'
import { PageConfigModel } from '../../src/domain-model/page/page-config-model'
import { ProjectRootModel } from '../../src/domain-model/project/project-root-model'
import type { NavigationClient } from '../../src/io/navigation-client'
import type { PageFileApi } from '../../src/io/page-file-api'

describe('ProjectRootModel load/save', () => {
  it('load flattens navigation root into navigationNodes', async () => {
    const client = {
      loadRoot: vi.fn().mockResolvedValue({
        id: 'demo_root',
        title: 'Demo App',
        nodeKind: 'module',
        childPlacement: 'sidebar',
        children: [
          {
            id: 'page-home',
            title: 'Home',
            nodeKind: 'page',
            path: 'page-home',
          },
        ],
      }),
    } as unknown as NavigationClient

    const project = await ProjectRootModel.load({
      projectId: 'demo',
      tenantId: 't1',
      client,
    })

    expect(project.name).toBe('Demo App')
    expect(project.navigationNodes.length).toBeGreaterThanOrEqual(2)
    const home = project.findNavigationNode('page-home')
    expect(home?.title).toBe('Home')
    expect(home?.parentId).toBe('demo_root')
  })

  it('save writes pageConfig files when fileApi provided', async () => {
    const saveFileContent = vi.fn().mockResolvedValue(undefined)
    const fileApi = { saveFileContent } as unknown as PageFileApi
    const client = {} as NavigationClient

    const project = new ProjectRootModel({
      projectId: 'demo',
      name: 'Demo',
      tenantId: 't1',
      navigationNodes: [
        new NavigationRowModel({
          id: 'page-home',
          parentId: '',
          projectId: 'demo',
          tenantId: 't1',
          title: 'Home',
          pageConfig: new PageConfigModel({ pageId: 'page-home', script: 'x' }),
        }),
      ],
    })
    project.dirty = true

    await project.save({ client, fileApi })

    expect(saveFileContent).toHaveBeenCalled()
    expect(project.dirty).toBe(false)
  })
})
