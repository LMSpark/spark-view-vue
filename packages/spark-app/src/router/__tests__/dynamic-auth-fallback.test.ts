import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../dynamic'
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import type { PageNodeFactoryLike, PageNodeLike } from '@spark-appworks/spark-project-model'

const DummyPage = defineComponent({
  name: 'DummyPage',
  template: '<div />',
})

const PRE_AUTH_NAV: ProjectModelData = {
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
      title: 'demo',
      nodeKind: 'system-page',
      path: '/demo/template-dsl',
      children: [],
    },
  ],
}

const DUMMY_PAGE_NODE_FACTORY = {
  create(pageId: string): PageNodeLike {
    return {
      pageId,
      get isLoaded() { return false },
      async load() {},
      toRenderConfig() {
        throw new Error('Dummy page model should not render in router tests')
      },
      getHttpClient: () => undefined,
    }
  },
  clearPageCache() {},
  clearAllCache: () => ({ size: 0, keys: [] }),
  getCacheStats: () => ({ size: 0, keys: [] }),
  getHttpClient: () => undefined,
} satisfies PageNodeFactoryLike

describe('DynamicRouter unauthorized fallback', () => {
  it('falls back to preAuthNavTree when loadNavigation returns 401', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      pageNodeFactory: DUMMY_PAGE_NODE_FACTORY,
      pageComponent: DummyPage,
      loadNavigation,
      preAuthNavTree: PRE_AUTH_NAV,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()
    expect(loadNavigation).toHaveBeenCalledOnce()
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/login')
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/demo/template-dsl')
    expect(router.getRoutes().find((route) => route.path === '/demo/template-dsl')?.meta['type']).toBe('invalid-system-page')
    expect(dynamicRouter.getNavTree()).toEqual(PRE_AUTH_NAV)
  })

  it('uses only dynamic navigation routes when authenticated navigation loads successfully', async () => {
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
    } satisfies ProjectModelData)

    const dynamicRouter = createDynamicRouter({
      router,
      pageNodeFactory: DUMMY_PAGE_NODE_FACTORY,
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

    expect(dynamicRouter.getRegisteredRoutes()).not.toContain('/demo/template-dsl')
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/t/:tenantId/:projectId/dashboard')
  })

  it('throws when loadNavigation returns 401 and no preAuthNavTree is configured', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      pageNodeFactory: DUMMY_PAGE_NODE_FACTORY,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
    })

    await expect(dynamicRouter.registerRoutes()).rejects.toEqual({ status: 401 })
  })
})
