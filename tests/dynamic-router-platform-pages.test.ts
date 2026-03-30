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
})