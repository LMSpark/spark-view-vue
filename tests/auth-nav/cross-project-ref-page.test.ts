import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPageNodeFactory, type PageNodeFactoryLike } from '@spark-view/spark-project-model'
import { HttpClientBase } from '@spark-view/spark-utils'
import type { HttpResponse, RequestConfig } from '@spark-view/spark-utils'
import type { ProjectModelData } from '@spark-view/spark-project-model'
import { CrossProjectRefPage } from '../../packages/spark-app/src/router/cross-project-ref-page'

function isPageNodeLike(value: unknown): value is { pageId: string; load: () => Promise<void> } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof Reflect.get(value, 'pageId') === 'string'
    && typeof Reflect.get(value, 'load') === 'function'
}

const navTreeState = vi.hoisted((): { tree: ProjectModelData | null } => ({
  tree: null,
}))

const rendererState = vi.hoisted((): { props: Record<string, unknown> | null } => ({
  props: null,
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
        pageNode: {
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

class RecordingHttpClient extends HttpClientBase {
  constructor(private readonly requests: RequestConfig[]) {
    super({}, 'RecordingHttpClient')
  }

  protected async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const url = String(config.url)
    const content = url.endsWith('/pagedata.json')
      ? '{"dataSetName":"CrossProject","tables":{}}'
      : url.endsWith('/rule.json')
        ? '[]'
        : ''
    return {
      data: {
        protocolVersion: 4,
        ok: true,
        data: { content, timestamp: '1' },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
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
    const httpClient = new RecordingHttpClient(requests)

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

    const pageNodeFactory = createPageNodeFactory({ httpClient })

    mount(CrossProjectRefPage, {
      props: {
        pageNodeFactory,
        tenantId: 'lmspark',
        hostProjectId: 'homepage',
        routePath: `/t/lmspark/homepage/__ref/${hostRefNodeId}`,
        routeMeta: {
          type: 'cross-project-ref',
          pageId: hostRefNodeId,
        },
      },
      global: {
        plugins: [router],
      },
    })

    expect(rendererState.props?.['pageId']).toBe('project-list')

    const rawPageNode = rendererState.props?.['pageNode']
    const pageNode = isPageNodeLike(rawPageNode) ? rawPageNode : undefined
    expect(pageNode).toBeDefined()
    if (!pageNode) return
    expect(pageNode.pageId).toBe('project-list')

    await pageNode.load()

    const ruleRequest = requests.find((request) =>
      String(request.url).endsWith('/project-list/rule.json'),
    )
    expect(ruleRequest?.url).toBe('/tenants/lmspark/projects/engineering-pm/pages-config/project-list/rule.json')
    expect(ruleRequest?.headers).toMatchObject({
      'X-Tenant-Id': 'lmspark',
      'X-Project-Id': 'engineering-pm',
    })
  })
})
