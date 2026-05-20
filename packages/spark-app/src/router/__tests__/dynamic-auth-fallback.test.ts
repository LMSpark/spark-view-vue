import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../dynamic'
import type { AppNavRoot } from '../../navigation/nav-model'
import { BasePageConfigLoader } from '@spark-view/spark-page-config/page/loading'
import type {
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageCssConfig,
  PageDataConfig,
  PageScriptConfig,
  RuleConfig,
} from '@spark-view/spark-page-config/page/loading'

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

class DummyPageConfigLoader extends BasePageConfigLoader {
  override async loadPageConfig(): Promise<ConfigLoadResult<PageConfig>> {
    return { success: false }
  }

  override async loadRule(): Promise<ConfigLoadResult<RuleConfig[]>> {
    return { success: false }
  }

  override async loadPageData(): Promise<ConfigLoadResult<PageDataConfig>> {
    return { success: false }
  }

  override async loadScript(): Promise<ConfigLoadResult<PageScriptConfig>> {
    return { success: false }
  }

  override async loadCss(): Promise<ConfigLoadResult<PageCssConfig>> {
    return { success: false }
  }

  override async loadPageFileContent(
    _pageId: string,
    _filename: PageConfigFileName,
    _options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>> {
    return { success: false }
  }

  override clearCache(): void {
    return undefined
  }

  override getCacheStats(): { size: number; keys: string[] } {
    return { size: 0, keys: [] }
  }
}

const DUMMY_CONFIG_LOADER = new DummyPageConfigLoader()

describe('DynamicRouter unauthorized fallback', () => {
  it('falls back to preAuthNavTree when loadNavigation returns 401', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      configLoader: DUMMY_CONFIG_LOADER,
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
      configLoader: DUMMY_CONFIG_LOADER,
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
      configLoader: DUMMY_CONFIG_LOADER,
      pageComponent: DummyPage,
      loadNavigation,
      isAuthenticated: () => true,
    })

    await expect(dynamicRouter.registerRoutes()).rejects.toEqual({ status: 401 })
  })
})
