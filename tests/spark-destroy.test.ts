import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-core'
import type { SparkEJ2GridConfig } from '@/types/ej2-components' 

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

    // Create a context directly to avoid EJ2 runtime during unmount
    const manager = Spark.manager()
    const ctx = manager.createContext({ type: config.type })
    expect(manager.getContext(ctx.id)).toBeTruthy()

    // Destroy it
    const destroyed = manager.destroyContext(ctx.id)
    expect(destroyed).toBe(true)

    // Now context should be undefined
    expect(manager.getContext(ctx.id)).toBeUndefined()
  })
})