import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { Spark, SparkPageRenderer, type SparkNode } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { PageConfig } from '@spark-view/spark-page-config'
import { buildPageChildren } from '../packages/spark-component/src/page/binding'
import type { ActionExecutionContext } from '../packages/spark-component/src/page/actions'

describe('SparkPageRenderer root props aggregation', () => {
  function createActionContext(): ActionExecutionContext {
    return {
      getDataSet: () => null,
      getPageService: () => null,
      getRouter: () => null,
    }
  }

  function createPageConfig(label: string): PageConfig {
    return {
      pageId: 'test-page',
      rule: [
        {
          type: 'r-table',
          props: {
            dataKey: 'Users@rows',
            label,
          },
        },
      ],
      data: SparkData.createDataSet({
        dataSetName: 'PageData',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [
              { name: 'id', type: 'string' },
            ],
            views: {
              default: {
                rows: [
                  { id: 'u-1' },
                ],
              },
            },
          },
        },
      }),
      script: undefined,
      css: undefined,
    }
  }

  it('passes SparkNode props through before rendering registered components', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    const pageConfig = createPageConfig('用户列表')

    const wrapper = mount(SparkPageRenderer, {
      props: {
        pageConfig,
        pageId: 'test-page',
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: unknown }) => h('pre', { class: 'children-json' }, JSON.stringify(children)),
      },
    })

    await flushPromises()

    const text = wrapper.find('.children-json').text()
    const children = JSON.parse(text) as Array<Record<string, unknown>>
    const firstChild = children[0] as Record<string, unknown>
    const props = firstChild['props'] as Record<string, unknown>

    expect(Array.isArray(children)).toBe(true)
    expect(props['dataKey']).toBe('Users@rows')
    expect(props['label']).toBe('用户列表')
    expect(firstChild['dataKey']).toBeUndefined()
    expect(firstChild['label']).toBeUndefined()

    debugSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('reloads when direct pageConfig files change under the same pageId', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    const wrapper = mount(SparkPageRenderer, {
      props: {
        pageConfig: createPageConfig('初始标题'),
        pageId: 'test-page',
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: unknown }) => h('pre', { class: 'children-json' }, JSON.stringify(children)),
      },
    })

    await flushPromises()

    const readLabel = (): string => {
      const text = wrapper.find('.children-json').text()
      const children = JSON.parse(text) as Array<Record<string, unknown>>
      const firstChild = children[0] as Record<string, unknown>
      const props = firstChild['props'] as Record<string, unknown>
      return String(props['label'])
    }

    expect(readLabel()).toBe('初始标题')

    await wrapper.setProps({
      pageConfig: createPageConfig('更新后标题'),
      pageId: 'test-page',
    })
    await flushPromises()

    expect(readLabel()).toBe('更新后标题')
  })

  it('reports async __init__ errors through runtime diagnostics', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    const onRuntimeError = vi.fn()

    mount(SparkPageRenderer, {
      props: {
        pageConfig: {
          ...createPageConfig('初始化'),
          script: "async function __init__() { throw new Error('ASYNC_INIT_FAIL') }",
        },
        pageId: 'test-page',
        onRuntimeError,
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: () => h('div', { class: 'page-content' }, 'ready'),
      },
    })

    await flushPromises()
    await flushPromises()

    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'init',
      pageId: 'test-page',
      message: expect.stringContaining('ASYNC_INIT_FAIL'),
    }))
  })

  it('reports page script event handler errors through runtime diagnostics', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    let boundClick: (() => unknown) | undefined
    const onRuntimeError = vi.fn()

    mount(SparkPageRenderer, {
      props: {
        pageConfig: {
          ...createPageConfig('点击'),
          rule: [
            {
              type: 'r-button',
              props: {
                onClick: 'explode',
              },
            },
          ],
          script: "function explode() { throw new Error('SCRIPT_CLICK_FAIL') }",
        },
        pageId: 'test-page',
        onRuntimeError,
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: Array<{ props?: Record<string, unknown> }> }) => {
          boundClick = children[0]?.props?.['onClick'] as (() => unknown) | undefined
          return h('button', { class: 'script-button' }, 'run')
        },
      },
    })

    await flushPromises()

    expect(boundClick).toBeTypeOf('function')
    expect(() => boundClick?.()).toThrow('SCRIPT_CLICK_FAIL')
    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'script-function',
      pageId: 'test-page',
      message: expect.stringContaining('SCRIPT_CLICK_FAIL'),
    }))
  })

  it('does not map non-builtin r-button action strings to page script clicks', async () => {
    const callFunc = vi.fn<(functionName: string, ...args: unknown[]) => unknown>()
    const children = buildPageChildren([
      {
        type: 'r-button',
        id: 'btn__new',
        props: {
          label: '新增凭证',
          action: 'newVoucher',
        },
      },
      {
        type: 'r-button',
        id: 'btn__refresh',
        props: {
          label: '刷新',
          action: 'refresh',
        },
      },
    ] as never, {
      callFunc,
      actionCtx: createActionContext(),
    })

    const createButtonProps = children[0]?.props as Record<string, unknown>
    const refreshButtonProps = children[1]?.props as Record<string, unknown>

    expect(createButtonProps['onClick']).toBeUndefined()
    expect(callFunc).not.toHaveBeenCalled()
    expect(refreshButtonProps['onClick']).toBeUndefined()
  })

  it('does not infer host route name as pageId on cross-project-ref routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/:refNodeId',
          name: 'spark-cross-project-ref-host',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
          meta: {
            type: 'cross-project-ref',
            crossProjectRefHost: true,
          },
        },
      ],
    })
    const loadPageConfig = vi.fn()

    await router.push('/t/lmspark/homepage/__ref/ref-node')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        configLoader: {
          loadPageConfig,
          loadRule: vi.fn(),
          loadPageData: vi.fn(),
          loadScript: vi.fn(),
          loadCss: vi.fn(),
          loadPageFileContent: vi.fn(),
          clearCache: vi.fn(),
          getCacheStats: () => ({ size: 0, keys: [] }),
        },
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
    })

    await flushPromises()

    expect(loadPageConfig).not.toHaveBeenCalled()
  })

  it('loads explicit target pageId inside cross-project-ref routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/:refNodeId',
          name: 'spark-cross-project-ref-host',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
          meta: {
            type: 'cross-project-ref',
            crossProjectRefHost: true,
          },
        },
      ],
    })
    const pageConfig = createPageConfig('跨项目目标')
    const loadPageConfig = vi.fn(async () => ({
      success: true,
      data: {
        ...pageConfig,
        pageId: 'project-list',
      },
      source: 'remote' as const,
      timestamp: Date.now(),
    }))

    await router.push('/t/lmspark/homepage/__ref/ref-node')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        pageId: 'project-list',
        configLoader: {
          loadPageConfig,
          loadRule: vi.fn(),
          loadPageData: vi.fn(),
          loadScript: vi.fn(),
          loadCss: vi.fn(),
          loadPageFileContent: vi.fn(),
          clearCache: vi.fn(),
          getCacheStats: () => ({ size: 0, keys: [] }),
        },
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: unknown }) => h('pre', { class: 'children-json' }, JSON.stringify(children)),
      },
    })

    await flushPromises()

    expect(loadPageConfig).toHaveBeenCalledWith('project-list')
  })

  it('does not reload an explicit pageId when the global route changes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/old',
          name: 'old-page',
          component: defineComponent({ name: 'OldRouteStub', render: () => h('div') }),
          meta: { type: 'config-page', pageId: 'old-page' },
        },
        {
          path: '/pages/new',
          name: 'new-page',
          component: defineComponent({ name: 'NewRouteStub', render: () => h('div') }),
          meta: { type: 'config-page', pageId: 'new-page' },
        },
      ],
    })
    const loadPageConfig = vi.fn(async (pageId: string) => ({
      success: true,
      data: {
        ...createPageConfig(pageId),
        pageId,
      },
      source: 'remote' as const,
      timestamp: Date.now(),
    }))

    await router.push('/pages/old')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        pageId: 'old-page',
        configLoader: {
          loadPageConfig,
          loadRule: vi.fn(),
          loadPageData: vi.fn(),
          loadScript: vi.fn(),
          loadCss: vi.fn(),
          loadPageFileContent: vi.fn(),
          clearCache: vi.fn(),
          getCacheStats: () => ({ size: 0, keys: [] }),
        },
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
    })

    await flushPromises()
    expect(loadPageConfig).toHaveBeenCalledTimes(1)
    expect(loadPageConfig).toHaveBeenLastCalledWith('old-page')

    await router.push('/pages/new')
    await router.isReady()
    await flushPromises()

    expect(loadPageConfig).toHaveBeenCalledTimes(1)
  })

  it('promotes legacy props.id in page rules', () => {
    const children = buildPageChildren([
      {
        type: 'r-button',
        props: {
          id: 'legacy-button',
          label: '旧按钮',
        },
      },
    ] as never, {
      callFunc: () => undefined,
      actionCtx: createActionContext(),
    })

    expect(children[0]?.id).toBe('legacy-button')
    expect(children[0]?.props).toEqual({ label: '旧按钮' })
  })

  it('tree-node-scope demo keeps native tree props typed and button clicks executable', () => {
    const callFunc = vi.fn<(functionName: string, ...args: unknown[]) => unknown>()
    const ruleText = readFileSync(
      resolve(process.cwd(), 'spark-ai-server/data/pages-config/lmspark/homepage/tree-node-scope-demo/rule.json'),
      'utf8',
    )
    const children = buildPageChildren(JSON.parse(ruleText) as never, {
      callFunc,
      actionCtx: createActionContext(),
    })

    const section = children[0] as SparkNode
    const sectionChildren = Array.isArray(section.children) ? section.children : []
    const treeNode = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.type === 'r-tree')
    const currentButton = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.id === 'btn-get-current')
    const checkedButton = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.id === 'btn-get-checked')

    expect(treeNode).toBeDefined()
    const treeProps = treeNode?.props?.['treeProps'] as Record<string, unknown>
    expect(treeProps['filterNodeMethod']).toBeUndefined()
    expect(treeProps['showCheckbox']).toBe(true)
    expect(treeProps['draggable']).toBe(true)

    expect(currentButton?.props?.['text']).toBeUndefined()
    expect(currentButton?.props?.['label']).toBe('获取当前选中节点')
    expect(currentButton?.props?.['onClick']).toBeTypeOf('function')

    expect(checkedButton?.props?.['text']).toBeUndefined()
    expect(checkedButton?.props?.['label']).toBe('获取勾选节点')
    expect(checkedButton?.props?.['onClick']).toBeTypeOf('function')

    ;(currentButton?.props?.['onClick'] as (() => unknown))()
    ;(checkedButton?.props?.['onClick'] as (() => unknown))()

    expect(callFunc).toHaveBeenCalledWith('getCurrentNode')
    expect(callFunc).toHaveBeenCalledWith('getCheckedNodes')
  })
})
