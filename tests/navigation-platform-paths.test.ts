import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import type { AppNavRoot } from '@spark-view/spark-utils'
import { useNavigation } from '../packages/spark-app/src/navigation/useNavigation'

type NavigateToPath = (path: string) => void

interface MountedNavigationProbe {
  router: Router
  navigateToPath: NavigateToPath
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

async function mountNavigationProbe(initialPath: string): Promise<MountedNavigationProbe> {
  let navigateToPath: NavigateToPath | null = null

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

  const resolvedNavigateToPath: NavigateToPath = navigateToPath

  return { router, navigateToPath: resolvedNavigateToPath }
}

describe('useNavigation platform paths', () => {
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
})