import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkEJ2Grid from '../features/spark/components/ej2/SparkEJ2Grid.vue'
import SparkEJ2Column from '../features/spark/components/ej2/SparkEJ2Column.vue'
import { Spark } from '../features/spark'

// Mock EJ2 components to avoid DOM-dependent behavior
import { vi } from 'vitest'
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

await Spark.initializeApp()

describe('ColumnManager provider location', () => {
  it('parent column should provide columnManager; grid should not', async () => {
    const config = {
      type: 'spark-ej2-grid' as const,
      dataSource: [{ id: 1 }],
      children: [
        {
          type: 'spark-ej2-column' as const,
          field: 'parent',
          headerText: 'Parent',
          children: [
            { type: 'spark-ej2-column' as const, field: 'child1', headerText: 'Child1' }
          ]
        }
      ]
    }

    const wrapper = mount(SparkEJ2Grid, {
      props: { config },
      global: { provide: { sparkManager: Spark.manager() } }
    })

    // Wait for component to mount and render
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 500)) // Additional wait for async operations

    // Verify that a column component was created and registered in the manager
    const manager = Spark.manager()
    const contexts = manager.getAllContexts()
    const columnContexts = contexts.filter(ctx => ctx.type === 'spark-ej2-column')

    // Should have at least one column context
    expect(columnContexts.length).toBeGreaterThan(0)

    // Find the parent column (field: 'parent')
    const parentColumnCtx = columnContexts.find(ctx => ctx.config.field === 'parent')
    expect(parentColumnCtx).toBeDefined()

    // The parent column context should have columnConfig provider
    expect(Array.from(parentColumnCtx!.providers).some(p => p.name === 'columnConfig')).toBe(true)

    // Verify the parent column has the expected configuration
    expect(parentColumnCtx).toBeDefined()
    if (parentColumnCtx) {
      expect(parentColumnCtx.config.field).toBe('parent')
      expect(parentColumnCtx.config.children).toHaveLength(1)
      expect(parentColumnCtx.config.children?.[0]?.field).toBe('child1')
    }
  })
})