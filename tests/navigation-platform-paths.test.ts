import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import type { ConfigLoader } from '@spark-view/spark-page-config'
import type { AppNavRoot } from '../packages/spark-app/src/navigation/nav-model'
import { useNavigation } from '../packages/spark-app/src/navigation/useNavigation'
import { CROSS_PROJECT_REF_HOST_ROUTE_NAME } from '../packages/spark-app/src/router/cross-project-ref-route'

type NavigateToPath = (path: string) => void
type NavigateToNode = ReturnType<typeof useNavigation>['navigateTo']

const refreshRoutesMock = vi.hoisted(() => vi.fn<() => Promise<AppNavRoot | null>>())

vi.mock('../packages/spark-app/src/navigation/nav-access', () => ({
  refreshRoutes: refreshRoutesMock,
}))

interface MountedNavigationProbe {
  router: Router
  navigateToPath: NavigateToPath
  navigateTo: NavigateToNode
}

const DummyPage = defineComponent({
  name: 'DummyPage',
  setup() {
    return () => h('div')
  },
})

const NAV_ROOT: AppNavRoot = {
  id: 'root',
  title: 'root',
  childPlacement: 'header',
  children: [],
}

const DUMMY_CONFIG_LOADER: ConfigLoader = {
  async loadPageConfig() {
    return { success: false }
  },
  async loadRule() {
    return { success: false }
  },
  async loadPageData() {
    return { success: false }
  },
  async loadScript() {
    return { success: true, data: '' }
  },
  async loadCss() {
    return { success: true, data: '' }
  },
  clearCache() {},
  getCacheStats() {
    return { size: 0, keys: [] }
  },
}

async function mountNavigationProbe(initialPath: string): Promise<MountedNavigationProbe> {
  let navigateToPath: NavigateToPath | null = null
  let navigateTo: NavigateToNode | null = null

  const ProbeRoot = defineComponent({
    name: 'ProbeRoot',
    props: {
      navRoot: {
        type: Object,
        required: true,
      },
    },
    setup(props) {
      const navigation = useNavigation(props.navRoot as AppNavRoot)
      navigateToPath = navigation.navigateToPath
      navigateTo = navigation.navigateTo
      return () => h('div')
    },
  })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/demo/r-form-compare',
        name: 'demo-r-form-compare',
        component: DummyPage,
        meta: { type: 'system-page' },
      },
      {
        path: '/t/:tenantId/:projectId/home',
        name: 'tenant-home',
        component: DummyPage,
        meta: { type: 'system-page' },
      },
      {
        path: '/t/:tenantId/:projectId/dashboard',
        name: 'tenant-dashboard',
        component: DummyPage,
        meta: { type: 'system-page' },
      },
      {
        path: '/t/:tenantId/:projectId/homepage/dataset-demo',
        name: 'tenant-dataset-demo-config',
        component: DummyPage,
        meta: { type: 'config-page', pageId: '06c56d10-4ff6-4c4d-a6ce-772536592c75' },
      },
      {
        path: '/t/:tenantId/:projectId/homepage/dataset-demo',
        name: 'tenant-dataset-demo-ref',
        component: DummyPage,
        meta: {
          type: 'cross-project-ref',
          refProjectId: 'demo-project',
          refPath: '@app:demo-project/dataset-demo',
          refPageId: 'dataset-demo',
        },
      },
      {
        path: '/t/:tenantId/:projectId/__ref/06c56d10-4ff6-4c4d-a6ce-772536592c75',
        name: 'tenant-stale-ref-config',
        component: DummyPage,
        props: { configLoader: DUMMY_CONFIG_LOADER },
        meta: { type: 'config-page', pageId: '06c56d10-4ff6-4c4d-a6ce-772536592c75' },
      },
    ],
  })

  await router.push(initialPath)
  await router.isReady()

  mount(ProbeRoot, {
    props: { navRoot: NAV_ROOT },
    global: {
      plugins: [router],
    },
  })

  if (navigateToPath === null) {
    throw new Error('navigation probe did not expose navigateToPath')
  }
  if (navigateTo === null) {
    throw new Error('navigation probe did not expose navigateTo')
  }

  const resolvedNavigateToPath: NavigateToPath = navigateToPath
  const resolvedNavigateTo: NavigateToNode = navigateTo

  return { router, navigateToPath: resolvedNavigateToPath, navigateTo: resolvedNavigateTo }
}

describe('useNavigation platform paths', () => {
  beforeEach(() => {
    refreshRoutesMock.mockReset()
    refreshRoutesMock.mockResolvedValue(null)
  })

  it('keeps platform system pages unprefixed when current route is tenant scoped', async () => {
    const { router, navigateToPath } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateToPath('/demo/r-form-compare')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/demo/r-form-compare')
  })

  it('still prefixes tenant system pages from bare app paths', async () => {
    const { router, navigateToPath } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateToPath('/dashboard')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/t/lmspark/homepage/dashboard')
  })

  it('uses the named cross-project route when another route has the same path', async () => {
    const { router, navigateToPath } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateToPath('/homepage/dataset-demo')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('tenant-dataset-demo-ref')
    expect(router.currentRoute.value.meta['refProjectId']).toBe('demo-project')
  })

  it('refreshes stale routes and opens ref nodes through the host route', async () => {
    const { router, navigateTo } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateTo({
      id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
      title: 'project list ref',
      nodeKind: 'ref',
      path: '/project-list',
      refPath: '@app:engineering-pm/project-list',
      refProjectId: 'engineering-pm',
      children: [],
    })
    await flushPromises()

    expect(refreshRoutesMock).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe(CROSS_PROJECT_REF_HOST_ROUTE_NAME)
    expect(router.currentRoute.value.params['refNodeId']).toBe('06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(router.hasRoute(CROSS_PROJECT_REF_HOST_ROUTE_NAME)).toBe(true)
  })
})
