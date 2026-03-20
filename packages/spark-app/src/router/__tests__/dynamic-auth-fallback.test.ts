import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../dynamic'
import type { AppNavRoot } from '@spark-view/spark-utils'

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
  ],
}

describe('DynamicRouter unauthorized fallback', () => {
  it('falls back to preAuthNavTree when loadNavigation returns 401', async () => {
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
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()
    expect(loadNavigation).toHaveBeenCalledOnce()
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/login')
    expect(dynamicRouter.getNavTree()).toEqual(PRE_AUTH_NAV)
  })

  it('throws when loadNavigation returns 401 and no preAuthNavTree is configured', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: {} as never,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
    })

    await expect(dynamicRouter.registerRoutes()).rejects.toEqual({ status: 401 })
  })
})
