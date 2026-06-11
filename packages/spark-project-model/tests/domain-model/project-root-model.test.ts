import { describe, expect, it } from 'vitest'
import {
  NavigationRowModel,
  PageConfigModel,
  ProjectRootModel,
} from '../../src/index.js'

describe('ProjectRootModel', () => {
  it('supports navigation CRUD and revision events', () => {
    const project = new ProjectRootModel({
      projectId: 'demo',
      name: 'Demo',
      tenantId: 'tenant-1',
      navigationNodes: [
        new NavigationRowModel({
          id: 'page-home',
          parentId: '',
          projectId: 'demo',
          tenantId: 'tenant-1',
          title: 'Home',
          pageConfig: new PageConfigModel({ pageId: 'page-home' }),
        }),
      ],
    })

    const events: string[] = []
    project.subscribe((event) => {
      events.push(event.type)
    })

    project.addNavigationNode(
      new NavigationRowModel({
        id: 'page-about',
        parentId: '',
        projectId: 'demo',
        tenantId: 'tenant-1',
        title: 'About',
      }),
    )
    project.updateNavigationNode('page-home', { title: 'Home Updated' })
    project.selectNavigationNode('page-home')
    project.removeNavigationNode('page-about')

    expect(project.navigationNodes).toHaveLength(1)
    expect(project.findNavigationNode('page-home')?.title).toBe('Home Updated')
    expect(project.selectedNodeId).toBe('page-home')
    expect(project.dirty).toBe(true)
    expect(project.revision).toBe(4)
    expect(events).toEqual([
      'navigation.changed',
      'navigation.changed',
      'selection.changed',
      'navigation.changed',
    ])
  })
})
