import { config as testUtilsConfig, flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { Spark, SparkPageRenderer, type SparkNode } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import { BasePageConfigLoader } from '@spark-view/spark-page-config'
import {
  compileRule,
} from '@spark-view/spark-page-config'
import type {
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageCssConfig,
  PageDataConfig,
  PageScriptConfig,
  RuleConfig,
} from '@spark-view/spark-page-config'
import { buildPageChildren } from '../packages/spark-component/src/page/binding'
import type { ActionExecutionContext } from '../packages/spark-component/src/page/actions'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(message)
}

function requireRecordArray(value: unknown, message: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(message)
  return value.map((item, index) => requireRecord(item, `${message}: item ${index} is not an object`))
}

function parseChildrenJson(text: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(text)
  return requireRecordArray(parsed, 'Expected rendered children JSON array')
}

function firstChildPropsFromJson(text: string): Record<string, unknown> {
  const children = parseChildrenJson(text)
  return requireRecord(children[0]?.['props'], 'Expected first child props')
}

function readOptionalFunction(value: unknown): (() => unknown) | undefined {
  return typeof value === 'function' ? () => Reflect.apply(value, undefined, []) : undefined
}

function requireFunction(value: unknown, message: string): () => unknown {
  const fn = readOptionalFunction(value)
  if (fn !== undefined) return fn
  throw new Error(message)
}

function requireSparkNode(value: SparkNode | string | number | undefined, message: string): SparkNode {
  if (value !== undefined && typeof value === 'object') return value
  throw new Error(message)
}

function disableSparkComponentRendererStub(): () => void {
  const stubs = isRecord(testUtilsConfig.global.stubs) ? testUtilsConfig.global.stubs : {}
  const hadPascal = Object.prototype.hasOwnProperty.call(stubs, 'SparkComponentRenderer')
  const hadKebab = Object.prototype.hasOwnProperty.call(stubs, 'spark-component-renderer')
  const previousPascal = stubs['SparkComponentRenderer']
  const previousKebab = stubs['spark-component-renderer']

  delete stubs['SparkComponentRenderer']
  delete stubs['spark-component-renderer']
  testUtilsConfig.global.stubs = stubs

  return () => {
    if (hadPascal && previousPascal !== undefined) stubs['SparkComponentRenderer'] = previousPascal
    else delete stubs['SparkComponentRenderer']
    if (hadKebab && previousKebab !== undefined) stubs['spark-component-renderer'] = previousKebab
    else delete stubs['spark-component-renderer']
    testUtilsConfig.global.stubs = stubs
  }
}

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
            dataViewKey: 'Users@default',
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

  class TestRendererPageConfigLoader extends BasePageConfigLoader {
    constructor(
      private readonly loadPageConfigHandler: (pageId: string) => Promise<ConfigLoadResult<PageConfig>>,
    ) {
      super()
    }

    override loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
      return this.loadPageConfigHandler(pageId)
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
    const children = parseChildrenJson(text)
    const firstChild = requireRecord(children[0], 'Expected first rendered child')
    const props = requireRecord(firstChild['props'], 'Expected first rendered child props')

    expect(Array.isArray(children)).toBe(true)
    expect(props['dataViewKey']).toBe('Users@default')
    expect(props['label']).toBe('用户列表')
    expect(firstChild['dataViewKey']).toBeUndefined()
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
      const props = firstChildPropsFromJson(text)
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
          boundClick = readOptionalFunction(children[0]?.props?.['onClick'])
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
    const ruleNodes: SparkNode[] = [
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
    ]
    const children = buildPageChildren(ruleNodes, {
      callFunc,
      actionCtx: createActionContext(),
    })

    const createButtonProps = children[0]?.props ?? {}
    const refreshButtonProps = children[1]?.props ?? {}

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
    const loadPageConfig = vi.fn(async (): Promise<ConfigLoadResult<PageConfig>> => ({ success: false }))

    await router.push('/t/lmspark/homepage/__ref/ref-node')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        configLoader: new TestRendererPageConfigLoader(loadPageConfig),
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
    const loadPageConfig = vi.fn(async (): Promise<ConfigLoadResult<PageConfig>> => ({
      success: true,
      data: {
        ...pageConfig,
        pageId: 'project-list',
      },
      source: 'remote',
      timestamp: Date.now(),
    }))

    await router.push('/t/lmspark/homepage/__ref/ref-node')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        pageId: 'project-list',
        configLoader: new TestRendererPageConfigLoader(loadPageConfig),
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
    const loadPageConfig = vi.fn(async (pageId: string): Promise<ConfigLoadResult<PageConfig>> => ({
      success: true,
      data: {
        ...createPageConfig(pageId),
        pageId,
      },
      source: 'remote',
      timestamp: Date.now(),
    }))

    await router.push('/pages/old')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        pageId: 'old-page',
        configLoader: new TestRendererPageConfigLoader(loadPageConfig),
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
    const ruleNodes: SparkNode[] = [
      {
        type: 'r-button',
        props: {
          id: 'legacy-button',
          label: '旧按钮',
        },
      },
    ]
    const children = buildPageChildren(ruleNodes, {
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
    const children = buildPageChildren(compileRule(ruleText), {
      callFunc,
      actionCtx: createActionContext(),
    })

    const section = requireSparkNode(children[0], 'Expected first child to be a SparkNode')
    const sectionChildren = Array.isArray(section.children) ? section.children : []
    const treeNode = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.type === 'r-tree')
    const currentButton = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.id === 'btn-get-current')
    const checkedButton = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.id === 'btn-get-checked')

    expect(treeNode).toBeDefined()
    const treeProps = requireRecord(treeNode?.props?.['treeProps'], 'Expected r-tree treeProps')
    expect(treeProps['filterNodeMethod']).toBeUndefined()
    expect(treeProps['showCheckbox']).toBe(true)
    expect(treeProps['draggable']).toBe(true)

    expect(currentButton?.props?.['text']).toBeUndefined()
    expect(currentButton?.props?.['label']).toBe('获取当前选中节点')
    expect(currentButton?.props?.['onClick']).toBeTypeOf('function')

    expect(checkedButton?.props?.['text']).toBeUndefined()
    expect(checkedButton?.props?.['label']).toBe('获取勾选节点')
    expect(checkedButton?.props?.['onClick']).toBeTypeOf('function')

    requireFunction(currentButton?.props?.['onClick'], 'Expected current button click handler')()
    requireFunction(checkedButton?.props?.['onClick'], 'Expected checked button click handler')()

    expect(callFunc).toHaveBeenCalledWith('getCurrentNode')
    expect(callFunc).toHaveBeenCalledWith('getCheckedNodes')
  })

  it('refreshes page script Render components after __init__ mutates script state', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/render-init',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/render-init')
    await router.isReady()

    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    try {
      const wrapper = mount(SparkPageRenderer, {
        props: {
          pageId: 'render-init',
          pageConfig: {
            ...createPageConfig('render-init'),
            pageId: 'render-init',
            rule: [{ type: 'RenderInitProbe' }],
            script: `
              let _pageState = { label: 'before-init' }
              function __init__() { _pageState.label = 'after-init' }
              function RenderInitProbe() {
                return h('div', { class: 'init-probe' }, _pageState.label)
              }
            `,
          },
        },
        global: {
          plugins: [Spark.createPlugin(), router],
        },
      })

      await flushPromises()
      await flushPromises()

      expect(wrapper.find('.init-probe').exists(), wrapper.html()).toBe(true)
      expect(wrapper.find('.init-probe').text()).toBe('after-init')
    } finally {
      restoreSparkRendererStub()
    }
  })

  it('refreshes nested page script Render events after script state changes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/render-click',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/render-click')
    await router.isReady()

    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    try {
      const wrapper = mount(SparkPageRenderer, {
        props: {
          pageId: 'render-click',
          pageConfig: {
            ...createPageConfig('render-click'),
            pageId: 'render-click',
            rule: [{ type: 'RenderClickProbe' }, { type: 'RenderMirrorProbe' }],
            script: `
              let _pageState = { current: 'user1' }
              function selectRole(next) { _pageState.current = next }
              function RenderClickProbe() {
                var current = _pageState.current
                return h('div', { class: 'click-probe', 'data-current': current }, [
                  h('button', {
                    class: 'click-probe-button',
                    onClick: function() { selectRole('manager') }
                  }, current)
                ])
              }
              function RenderMirrorProbe() {
                return h('div', { class: 'mirror-probe', 'data-current': _pageState.current }, _pageState.current)
              }
            `,
          },
        },
        global: {
          plugins: [Spark.createPlugin(), router],
        },
      })

      await flushPromises()
      expect(wrapper.find('.click-probe').exists(), wrapper.html()).toBe(true)
      expect(wrapper.find('.click-probe').attributes('data-current')).toBe('user1')
      expect(wrapper.find('.mirror-probe').attributes('data-current')).toBe('user1')

      await wrapper.find('.click-probe-button').trigger('click')
      await flushPromises()

      expect(wrapper.find('.click-probe').attributes('data-current')).toBe('manager')
      expect(wrapper.find('.click-probe-button').text()).toBe('manager')
      expect(wrapper.find('.mirror-probe').attributes('data-current')).toBe('manager')
      expect(wrapper.find('.mirror-probe').text()).toBe('manager')
    } finally {
      restoreSparkRendererStub()
    }
  })
})
