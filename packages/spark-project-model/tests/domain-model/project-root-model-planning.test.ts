import { describe, expect, it } from 'vitest'
import {
  NavigationRowModel,
  ProjectRootModel,
} from '../../src/index.js'

describe('ProjectRootModel planning APIs', () => {
  it('reads planning input from root row description', () => {
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
          description: 'Build a task manager',
          nodeKind: 'module',
        }),
      ],
    })

    expect(project.readProjectPlanningInput()).toEqual({
      requirement: 'Build a task manager',
    })
  })

  it('replaceNavigationChildren rebuilds flat rows and marks dirty', () => {
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
          description: 'Build a task manager',
          nodeKind: 'module',
        }),
      ],
    })

    const navigationRoot = project.replaceNavigationChildren({
      children: [
        {
          id: 'core-module',
          title: 'Core',
          nodeKind: 'module',
          path: '/core',
          description: 'Core area',
          children: [
            {
              id: 'core-home',
              title: 'Home',
              nodeKind: 'page',
              path: '/core/home',
              description: 'Landing page',
            },
          ],
        },
      ],
    })

    expect(project.navigationDirty).toBe(true)
    expect(navigationRoot.children).toHaveLength(1)
    expect(project.toTree()).toHaveLength(1)
    expect(project.findNavigationNode('core-home')?.title).toBe('Home')
  })
})
