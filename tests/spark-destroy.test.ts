import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkEJ2Grid from '../features/spark/components/ej2/SparkEJ2Grid.vue'
import { initializeSparkComponents } from '../features/spark'
import { Spark } from '@spark-view/spark-core'
import type { SparkEJ2GridConfig } from '@spark-view/spark-core'

// Mock EJ2 Grid components
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

describe('destroyContext', () => {
  it('should destroy a context and remove it from manager', async () => {
    const config: SparkEJ2GridConfig = {
      type: 'spark-ej2-grid',
      dataSource: [{ id: 1, name: 'A' }],
      children: [ { type: 'spark-ej2-column', field: 'id', headerText: 'ID' } ]
    }

    const wrapper = mount(SparkEJ2Grid, { props: { config }, global: { provide: { sparkManager: Spark.manager() } } })

    expect(wrapper.exists()).toBe(true)

    const ctxId = (wrapper.vm as any).context.id as string
    expect(ctxId).toBeTruthy()

    // Ensure context exists
    expect(Spark.manager().getContext(ctxId)).toBeTruthy()

    // Destroy it
    const destroyed = Spark.manager().destroyContext(ctxId)
    expect(destroyed).toBe(true)

    // Now context should be undefined
    expect(Spark.manager().getContext(ctxId)).toBeUndefined()
  })
})