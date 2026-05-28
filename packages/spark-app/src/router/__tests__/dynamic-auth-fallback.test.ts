import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../dynamic'
import type { AppNavRoot } from '../../navigation/nav-model'
import type { PageModelFactoryLike, PageModelLike } from '@spark-view/spark-page-config'

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
      title: 'demo',
      nodeKind: 'system-page',
      path: '/demo/template-dsl',
      children: [],
    },
  ],
}

const DUMMY_PAGE_MODEL_FACTORY = {
  create(pageId: string): PageModelLike {
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
  clearCache() {},
  getCacheStats: () => ({ size: 0, keys: [] }),
  getHttpClient: () => undefined,
} satisfies PageModelFactoryLike

describe('DynamicRouter unauthorized fallback', () => {
  it('falls back to preAuthNavTree when loadNavigation returns 401', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      pageModelFactory: DUMMY_PAGE_MODEL_FACTORY,
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

  it('keeps preAuth static routes when authenticated navigation loads successfully', async () => {
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
      pageModelFactory: DUMMY_PAGE_MODEL_FACTORY,
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

  it('throws when loadNavigation returns 401 and no preAuthNavTree is configured', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      pageModelFactory: DUMMY_PAGE_MODEL_FACTORY,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
    })

    await expect(dynamicRouter.registerRoutes()).rejects.toEqual({ status: 401 })
  })
})
