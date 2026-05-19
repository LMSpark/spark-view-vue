import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DATA_ROW, DATA_SOURCE, Spark, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { DataRow } from '@spark-view/spark-data'
import RendererHostScope from '../packages/spark-component/src/components/containers/support/RendererHostScope.vue'
import { useFieldPermission } from '../packages/spark-component/src/components/fields/context/useFieldPermission'

describe('RendererHostScope DATA_ROW reactivity', () => {
  it('keeps cached DATA_ROW consumers in sync when row prop changes', async () => {
    const Probe = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'row-probe' } as SparkNode)
        const row = sparkConsume(DATA_ROW) as DataRow | null

        return () => h('div', {
          class: 'row-probe',
          'data-name': String(row?.['name'] ?? ''),
        }, String(row?.['name'] ?? ''))
      },
    })

    const registry = Spark.createRegistry()
    registry.register('row-probe', Probe)
    const plugin = Spark.createPlugin({ registry })

    const rowRef = ref<DataRow>({ id: 1, name: 'Alice' })

    const Harness = defineComponent({
      setup() {
        useSparkComponent({ type: 'test-page-root' } as SparkNode)
        return () => h(RendererHostScope, {
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

  it('writes field changes into DataView editingRows instead of the row mirror', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RendererEditingRowsDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
              commitMode: 'staged',
            },
          },
        },
      },
    })
    const view = ds.getView('Users', 'default')!

    const Probe = defineComponent({
      setup() {
        useSparkComponent({ type: 'field-probe' } as SparkNode)
        const field = useFieldPermission<string>({
          props: { field: 'name' },
          type: 'field-probe',
          fallbackValue: '',
        })

        return () => h('button', {
          class: 'field-probe',
          'data-name': String(field.fieldValue.value),
          onClick: () => field.syncValue('Alice Draft'),
        }, String(field.fieldValue.value))
      },
    })

    const registry = Spark.createRegistry()
    registry.register('field-probe', Probe)
    const plugin = Spark.createPlugin({ registry })

    const Harness = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'test-page-root' } as SparkNode)
        sparkProvide(DATA_SOURCE, view)
        return () => h(RendererHostScope, {
          row: view.rows[0],
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

    expect(wrapper.find('.field-probe').attributes('data-name')).toBe('Alice')

    await wrapper.find('.field-probe').trigger('click')
    await nextTick()

    expect(view.rows[0]?.['name']).toBe('Alice')
    expect(view.getEditingPatch(1)).toEqual({ name: 'Alice Draft' })
    expect(view.editingRows[0]?.['name']).toBe('Alice Draft')
    expect(wrapper.find('.field-probe').attributes('data-name')).toBe('Alice Draft')
  })
})
