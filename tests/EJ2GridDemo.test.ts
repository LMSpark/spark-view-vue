// tests/EJ2GridDemo.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkEJ2Grid from '../features/spark/components/ej2/SparkEJ2Grid.vue'
import { Spark, defaultComponentRegistry } from '@spark-view/spark-core'
import type { SparkEJ2GridConfig } from '@spark-view/spark-core'

// Mock EJ2 components
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

describe('EJ2GridDemo', () => {
  it('should render EJ2 grid with SPARK components', async () => {
    const config: SparkEJ2GridConfig = {
      type: 'spark-ej2-grid',
      dataSource: [
        { id: 1, name: 'Test User', age: 25 }
      ],
      children: [
        { type: 'spark-ej2-column', field: 'id', headerText: 'ID' },
        { type: 'spark-ej2-column', field: 'name', headerText: 'Name' },
        { type: 'spark-ej2-column', field: 'age', headerText: 'Age' }
      ]
    }

    let wrapper

    // Register lightweight stubs for columns to avoid EJ2 runtime complexity in unit tests
    Spark.registerSparkComponent({ type: 'spark-ej2-column', name: 'spark-ej2-column', version: '1.0.0', component: { template: '<div class="stub-column" />' } as any })

    try {
      wrapper = mount(SparkEJ2Grid, {
        props: { config },
        global: { provide: { sparkManager: Spark.manager(), sparkRegistry: defaultComponentRegistry } }
      })
    } catch (e: any) {
      try { console.error('Mount threw (detailed):', e, typeof e, JSON.stringify(e, Object.getOwnPropertyNames(e))) } catch(_) { console.error('Mount threw (fallback):', e) }
      throw e
    }

    expect(wrapper.exists()).toBe(true)
  })
})