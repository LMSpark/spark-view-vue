import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { Spark, SparkPageRenderer } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { PageConfig } from '@spark-view/spark-page-config'

describe('SparkPageRenderer root props aggregation', () => {
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

    const pageConfig: PageConfig = {
      pageId: 'test-page',
      rule: [
        {
          type: 'r-table',
          dataKey: 'Users@rows',
          label: '用户列表',
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

    const wrapper = mount(SparkPageRenderer, {
      props: {
        pageConfig,
        pageId: 'test-page',
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ rules }: { rules: unknown }) => h('pre', { class: 'rules-json' }, JSON.stringify(rules)),
      },
    })

    await flushPromises()

    const text = wrapper.find('.rules-json').text()
    const rules = JSON.parse(text) as Array<Record<string, unknown>>
    const firstRule = rules[0] as Record<string, unknown>
    const props = firstRule['props'] as Record<string, unknown>

    expect(Array.isArray(rules)).toBe(true)
    expect(props['dataKey']).toBe('Users@rows')
    expect(props['label']).toBe('用户列表')
    expect(firstRule['dataKey']).toBeUndefined()
    expect(firstRule['label']).toBeUndefined()

    debugSpy.mockRestore()
    logSpy.mockRestore()
  })
})
