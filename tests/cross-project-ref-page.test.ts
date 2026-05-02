import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ConfigLoader } from '@spark-view/spark-page-config'
import type { AppNavRoot, HttpClient, RequestConfig } from '@spark-view/spark-utils'
import { CrossProjectRefPage } from '../packages/spark-app/src/router/cross-project-ref-page'

const navTreeState = vi.hoisted(() => ({
  tree: null as AppNavRoot | null,
}))

const rendererState = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}))

vi.mock('../packages/spark-app/src/navigation/nav-access', () => ({
  getNavTree: () => navTreeState.tree,
}))

vi.mock('@spark-view/spark-component', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return {
    SparkPageRenderer: vue.defineComponent({
      name: 'SparkPageRenderer',
      props: {
        pageId: {
          type: String,
          required: true,
        },
        configLoader: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        rendererState.props = props
        return () => vue.h('div', { class: 'renderer-stub' })
      },
    }),
  }
})

function createConfigLoader(httpClient: HttpClient): ConfigLoader {
  return {
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
      return { success: true, data: '', source: 'remote' }
    },
    async loadCss() {
      return { success: true, data: '', source: 'remote' }
    },
    clearCache() {},
    getCacheStats() {
      return { size: 0, keys: [] }
    },
    getHttpClient() {
      return httpClient
    },
  }
}

describe('CrossProjectRefPage', () => {
  beforeEach(() => {
    rendererState.props = null
    navTreeState.tree = null
  })

  it('resolves stale host UUID meta through the ref node target', async () => {
    const hostRefNodeId = '06c56d10-4ff6-4c4d-a6ce-772536592c75'
    const requests: RequestConfig[] = []
    const httpClient = {
      interceptors: {},
      async request<T = unknown>(config: RequestConfig): Promise<T> {
        requests.push(config)
        return { content: '[]' } as T
      },
      async requestFull() {
        return { data: { content: '[]' } }
      },
      async get() {
        return {}
      },
      async post() {
        return {}
      },
      async put() {
        return {}
      },
      async patch() {
        return {}
      },
      async delete() {
        return {}
      },
      clearCache() {},
    } as unknown as HttpClient

    navTreeState.tree = {
      id: 'root',
      title: 'root',
      childPlacement: 'sidebar',
      children: [
        {
          id: hostRefNodeId,
          title: 'project list ref',
          nodeKind: 'ref',
          refId: 'project-list',
          refPath: '@app:engineering-pm/project-list',
          refProjectId: 'engineering-pm',
          children: [],
        },
      ],
    }

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/:refNodeId',
          component: CrossProjectRefPage,
          meta: {
            type: 'cross-project-ref',
            pageId: hostRefNodeId,
          },
        },
      ],
    })

    await router.push(`/t/lmspark/homepage/__ref/${hostRefNodeId}`)
    await router.isReady()

    mount(CrossProjectRefPage, {
      props: { configLoader: createConfigLoader(httpClient) },
      global: {
        plugins: [router],
      },
    })

    expect(rendererState.props?.['pageId']).toBe('project-list')

    const scopedLoader = rendererState.props?.['configLoader'] as ConfigLoader
    await scopedLoader.loadRule('project-list')

    expect(requests[0]?.url).toBe('/tenants/lmspark/projects/engineering-pm/pages-config/project-list/rule.json')
    expect(requests[0]?.headers).toMatchObject({
      'X-Tenant-Id': 'lmspark',
      'X-Project-Id': 'engineering-pm',
    })
  })
})
