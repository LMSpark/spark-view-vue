import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AppNavRoot } from '@spark-view/spark-utils'
import { createDynamicRouter } from '../packages/spark-app/src/router/dynamic'

const DummyPage = defineComponent({
  name: 'DummyPage',
  template: '<div />',
})

const PRE_AUTH_NAV: AppNavRoot = {
  id: 'root',
  title: 'root',
  childPlacement: 'header',
  children: [
    {
      id: 'login-node',
      title: 'login',
      nodeKind: 'system-page',
      path: '/login',
      children: [],
    },
    {
      id: 'demo-node',
      title: 'template-dsl-demo',
      nodeKind: 'system-page',
      path: '/demo/template-dsl',
      children: [],
    },
  ],
}

describe('DynamicRouter platform pages', () => {
  it('falls back to preAuth routes when navigation loading returns 401', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      preAuthNavTree: PRE_AUTH_NAV,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: {
        '/demo/template-dsl': DummyPage,
      },
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    expect(dynamicRouter.getRegisteredRoutes()).toContain('/login')
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/demo/template-dsl')
    expect(dynamicRouter.getNavTree()).toEqual(PRE_AUTH_NAV)
  })

  it('keeps preAuth platform pages after authenticated navigation loads', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockResolvedValue({
      id: 'tenant-root',
      title: 'tenant-root',
      childPlacement: 'header',
      children: [
        {
          id: 'dashboard-node',
          title: 'dashboard',
          nodeKind: 'system-page',
          path: '/dashboard',
          children: [],
        },
      ],
    } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      preAuthNavTree: PRE_AUTH_NAV,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: {
        '/demo/template-dsl': DummyPage,
        '/dashboard': DummyPage,
      },
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    expect(dynamicRouter.getRegisteredRoutes()).toContain('/demo/template-dsl')
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/t/:tenantId/:projectId/dashboard')
  })

  it('resolves config-page pageId from trailing segment when node id is UUID', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockResolvedValue({
      id: 'tenant-root',
      title: 'tenant-root',
      childPlacement: 'header',
      children: [
        {
          id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
          title: 'tree-demo',
          nodeKind: 'page',
          path: '/homepage/tree-demo',
          children: [],
        },
      ],
    } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    const route = router.getRoutes().find(item => item.name === 'nav-06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(route?.meta['type']).toBe('config-page')
    expect(route?.meta['pageId']).toBe('tree-demo')
  })

  it('keeps ref nodes on their stable host route even when node.path points at the target page', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockResolvedValue({
      id: 'tenant-root',
      title: 'tenant-root',
      childPlacement: 'header',
      children: [
        {
          id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
          title: 'local dataset',
          nodeKind: 'page',
          path: '/homepage/dataset-demo',
          children: [],
        },
        {
          id: 'dataset-ref',
          title: 'remote dataset',
          nodeKind: 'ref',
          path: '/dataset-demo',
          refProjectId: 'analytics',
          refPath: '@app:analytics/dataset-demo',
          children: [],
        },
      ],
    } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    const configRoute = router.getRoutes().find(item => item.path === '/t/:tenantId/:projectId/homepage/dataset-demo')
    const refRoute = router.getRoutes().find(item => item.path === '/t/:tenantId/:projectId/__ref/dataset-ref')
    expect(configRoute?.name).toBe('nav-06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(configRoute?.meta['type']).toBe('config-page')
    expect(refRoute?.name).toBe('nav-dataset-ref')
    expect(refRoute?.meta['type']).toBe('cross-project-ref')
    expect(refRoute?.meta['refProjectId']).toBe('analytics')
    expect(refRoute?.meta['refPageId']).toBe('dataset-demo')
  })

  it('registers same-project ref host routes as ref pages', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockResolvedValue({
      id: 'tenant-root',
      title: 'tenant-root',
      childPlacement: 'header',
      children: [
        {
          id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
          title: 'dataset ref',
          nodeKind: 'ref',
          refPath: '/dataset-demo',
          children: [],
        },
      ],
    } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    const route = router.getRoutes().find(item => item.path === '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(route?.name).toBe('nav-06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(route?.meta['type']).toBe('cross-project-ref')
    expect(route?.meta['refPath']).toBe('/dataset-demo')
    expect(route?.meta['refProjectId']).toBeUndefined()
    expect(route?.meta['refPageId']).toBe('dataset-demo')
  })

  it('does not fall back to config pages for unresolved ref host routes', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockResolvedValue({
      id: 'tenant-root',
      title: 'tenant-root',
      childPlacement: 'header',
      children: [
        {
          id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
          title: 'unresolved ref',
          nodeKind: 'ref',
          refId: 'project-list',
          children: [],
        },
      ],
    } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    const route = router.getRoutes().find(item => item.path === '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(route?.meta['type']).toBe('cross-project-ref')
    expect(route?.meta['pageId']).toBe('project-list')
    expect(route?.meta['refPath']).toBeUndefined()
  })

  it('refreshes same-path routes when node kind changes to ref', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'tenant-root',
        title: 'tenant-root',
        childPlacement: 'header',
        children: [
          {
            id: 'stale-config',
            title: 'stale config',
            nodeKind: 'page',
            path: '/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75',
            children: [],
          },
        ],
      } satisfies AppNavRoot)
      .mockResolvedValueOnce({
        id: 'tenant-root',
        title: 'tenant-root',
        childPlacement: 'header',
        children: [
          {
            id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
            title: 'ref page',
            nodeKind: 'ref',
            refId: 'project-list',
            refPath: '@app:engineering-pm/project-list',
            refProjectId: 'engineering-pm',
            children: [],
          },
        ],
      } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()
    expect(router.getRoutes().find(item => item.path === '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75')?.meta['type']).toBe('config-page')

    await expect(dynamicRouter.refreshRoutes()).resolves.toBeTruthy()

    const route = router.getRoutes().find(item => item.path === '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(route?.name).toBe('nav-06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(route?.meta['type']).toBe('cross-project-ref')
    expect(route?.meta['refPageId']).toBe('project-list')
    expect(router.getRoutes().some(item => item.name === 'nav-stale-config')).toBe(false)
  })

  it('replaces stale same-path cross-project routes with the current nav route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75',
          name: 'stale-cross-project-ref',
          component: DummyPage,
          meta: {
            type: 'cross-project-ref',
            pageId: 'project-list',
            refPath: '@app:engineering-pm/project-list',
            refProjectId: 'engineering-pm',
          },
        },
      ],
    })
    const loadNavigation = vi.fn().mockResolvedValue({
      id: 'tenant-root',
      title: 'tenant-root',
      childPlacement: 'header',
      children: [
        {
          id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
          title: 'ref page',
          nodeKind: 'ref',
          refId: 'project-list',
          refPath: '@app:engineering-pm/project-list',
          refProjectId: 'engineering-pm',
          children: [],
        },
      ],
    } satisfies AppNavRoot)

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    const routes = router.getRoutes()
      .filter(item => item.path === '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(routes).toHaveLength(1)
    expect(routes[0]?.name).toBe('nav-06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(router.getRoutes().some(item => item.name === 'stale-cross-project-ref')).toBe(false)
  })
})
