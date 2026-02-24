import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkEJ2Grid } from '../src/features/spark-ej2'
import { Spark, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'

const { registry, rootContext } = Spark.createSystem()
// Initialize SPARK components (registers spark-ej2-grid / spark-ej2-column) for this manager
import { initializeSparkEJ2Components } from '../src/features/spark-ej2'
initializeSparkEJ2Components(registry)

// Mock EJ2 components so we can mount without real EJ2 runtime
vi.mock('@syncfusion/ej2-vue-grids', () => ({
  GridComponent: {
    name: 'GridComponent',
    template: '<div class="ej2-grid"><slot /></div>',
    props: ['dataSource', 'allowPaging', 'pageSettings', 'height']
  },
  ColumnsDirective: {
    name: 'ColumnsDirective',
    template: '<div class="ej2-columns"><slot /></div>'
  },
  ColumnDirective: {
    name: 'ColumnDirective',
    template: '<div class="ej2-column"><slot /></div>',
    props: ['field', 'headerText', 'width', 'columns']
  }
}))

describe('Column manager connector', () => {
  it('does not warn about missing connector for columnManager', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = {
      type: 'spark-ej2-grid' as const,
      dataSource: [{ id: 1, name: 'A' }],
      children: [
        { type: 'spark-ej2-column' as const, field: 'id', headerText: 'ID' },
        { type: 'spark-ej2-column' as const, field: 'name', headerText: 'Name' }
      ]
    }

    const wrapper = mount(SparkEJ2Grid, {
      props: { config },
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry, [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext } }
    })

    expect(wrapper.exists()).toBe(true)

    const calls = warnSpy.mock.calls
    const hasMissingConnector = calls.some(call => call.join(' ').includes("No connector found for capability 'columnManager'"))

    warnSpy.mockRestore()

    expect(hasMissingConnector).toBe(false)
  })
})
