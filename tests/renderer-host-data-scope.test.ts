import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DATA_ROW, Spark, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import type { IDataRow } from '@spark-view/spark-data'
import RendererHostDataScope from '../packages/spark-component/src/components/containers/support/RendererHostDataScope.vue'

describe('RendererHostDataScope DATA_ROW reactivity', () => {
  it('keeps cached DATA_ROW consumers in sync when row prop changes', async () => {
    const Probe = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'row-probe' } as SparkNode)
        const row = sparkConsume(DATA_ROW) as IDataRow | null

        return () => h('div', {
          class: 'row-probe',
          'data-name': String(row?.['name'] ?? ''),
        }, String(row?.['name'] ?? ''))
      },
    })

    const registry = Spark.createRegistry()
    registry.register('row-probe', Probe)
    const plugin = Spark.createPlugin({ registry })

    const rowRef = ref<IDataRow>({ id: 1, name: 'Alice' })

    const Harness = defineComponent({
      setup() {
        useSparkComponent({ type: 'test-page-root' } as SparkNode)
        return () => h(RendererHostDataScope, {
          row: rowRef.value,
        }, {
          default: () => h(Probe),
        })
      },
    })

    const wrapper = mount(Harness, {
      global: {
        plugins: [plugin],
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    expect(wrapper.find('.row-probe').attributes('data-name')).toBe('Alice')

    rowRef.value = { id: 2, name: 'Bob' }
    await nextTick()
    await nextTick()

    expect(wrapper.find('.row-probe').attributes('data-name')).toBe('Bob')
    expect(wrapper.find('.row-probe').text()).toBe('Bob')
  })
})
