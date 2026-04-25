import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { Spark, SparkPageRenderer } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { PageConfig } from '@spark-view/spark-page-config'
import { buildPageChildren } from '../packages/spark-component/src/page/binding'
import type { ActionExecutionContext } from '../packages/spark-component/src/page/actions'

describe('SparkPageRenderer root props aggregation', () => {
  function createActionContext(callFunc: (name: string, ...args: unknown[]) => unknown): ActionExecutionContext {
    return {
      getDataSet: () => null,
      getPageService: () => null,
      getRouter: () => null,
      callFunc,
    }
  }

  function createPageConfig(label: string): PageConfig {
    return {
      pageId: 'test-page',
      rule: [
        {
          type: 'r-table',
          dataKey: 'Users@rows',
          label,
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

  it('moves root-level node inputs into props before rendering registered components', async () => {
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

  it('does not map non-builtin r-button action strings to page script clicks', async () => {
    const callFunc = vi.fn<(functionName: string, ...args: unknown[]) => unknown>()
    const children = buildPageChildren([
      {
        type: 'r-button',
        props: {
          id: 'btn__new',
          label: '新增凭证',
          action: 'newVoucher',
        },
      },
      {
        type: 'r-button',
        props: {
          id: 'btn__refresh',
          label: '刷新',
          action: 'refresh',
        },
      },
    ] as never, {
      callFunc,
      actionCtx: createActionContext(callFunc),
    })

    const createButtonProps = children[0]?.props as Record<string, unknown>
    const refreshButtonProps = children[1]?.props as Record<string, unknown>

    expect(createButtonProps['onClick']).toBeUndefined()
    expect(callFunc).not.toHaveBeenCalled()
    expect(refreshButtonProps['onClick']).toBeUndefined()
  })
})
