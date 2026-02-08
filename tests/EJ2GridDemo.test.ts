// tests/EJ2GridDemo.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkEJ2Grid } from '../features/spark-ej2'
import { Spark, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../features/spark-ej2'
import type { SparkEJ2GridConfig } from '@/features/spark-ej2'

const { registry, rootContext } = Spark.createSystem()
initializeSparkEJ2Components(registry)

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

    const wrapper = mount(SparkEJ2Grid, {
      props: { config },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
          [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
        }
      }
    })

    expect(wrapper.exists()).toBe(true)
  })
})
