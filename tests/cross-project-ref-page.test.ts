import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { BasePageConfigLoader } from '@spark-view/spark-page-config'
import { HttpClientBase } from '@spark-view/spark-utils'
import type {
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageDataConfig,
  RuleConfig,
} from '@spark-view/spark-page-config'
import type { HttpResponse, RequestConfig } from '@spark-view/spark-utils'
import type { AppNavRoot } from '../packages/spark-app/src/navigation/nav-model'
import { CrossProjectRefPage } from '../packages/spark-app/src/router/cross-project-ref-page'

const navTreeState = vi.hoisted((): { tree: AppNavRoot | null } => ({
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

class TestPageConfigLoader extends BasePageConfigLoader {
  constructor(private readonly httpClient: HttpClientBase) {
    super()
  }

  override async loadPageConfig(): Promise<ConfigLoadResult<PageConfig>> {
    return { success: false }
  }

  override async loadRule(): Promise<ConfigLoadResult<RuleConfig[]>> {
    return { success: false }
  }

  override async loadPageData(): Promise<ConfigLoadResult<PageDataConfig>> {
    return { success: false }
  }

  override async loadScript(): Promise<ConfigLoadResult<string>> {
    return { success: true, data: '', source: 'remote' }
  }

  override async loadCss(): Promise<ConfigLoadResult<string>> {
    return { success: true, data: '', source: 'remote' }
  }

  override async loadPageFileContent(
    _pageId: string,
    _filename: PageConfigFileName,
    _options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>> {
    return { success: false }
  }

  override clearCache(): void {
    this.httpClient.clearCache()
  }

  override getCacheStats(): { size: number; keys: string[] } {
    return { size: 0, keys: [] }
  }

  override getHttpClient(): HttpClientBase {
    return this.httpClient
  }
}

function createConfigLoader(httpClient: HttpClientBase): BasePageConfigLoader {
  return new TestPageConfigLoader(httpClient)
}

function requirePageConfigLoader(value: unknown): BasePageConfigLoader {
  if (value instanceof BasePageConfigLoader) return value
  throw new Error('Expected BasePageConfigLoader instance')
}

class RecordingHttpClient extends HttpClientBase {
  constructor(private readonly requests: RequestConfig[]) {
    super({}, 'RecordingHttpClient')
  }

  protected async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {
      data: { content: '[]' },
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

    mount(CrossProjectRefPage, {
      props: {
        configLoader: createConfigLoader(httpClient),
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

    const scopedLoader = requirePageConfigLoader(rendererState.props?.['configLoader'])
    await scopedLoader.loadRule('project-list')

    expect(requests[0]?.url).toBe('/tenants/lmspark/projects/engineering-pm/pages-config/project-list/rule.json')
    expect(requests[0]?.headers).toMatchObject({
      'X-Tenant-Id': 'lmspark',
      'X-Project-Id': 'engineering-pm',
    })
  })
})

