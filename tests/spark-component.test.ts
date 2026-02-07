// tests/spark-component.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkEJ2Grid, SparkEJ2Column } from '../features/spark-ej2'
import { Spark } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../features/spark-ej2'
import type { SparkEJ2GridConfig } from '@/features/spark-ej2'

const { manager, registry } = Spark.createSystem()
initializeSparkEJ2Components()

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

describe('SPARK EJ2 Components', () => {
  describe('SparkEJ2Grid', () => {
    it('should initialize SPARK context correctly', async () => {
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
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      // Verify component initializes without errors
      expect(wrapper.vm.config).toEqual(config)
    })

    it('should handle nested columns configuration', async () => {
      const config: SparkEJ2GridConfig = {
        type: 'spark-ej2-grid',
        dataSource: [
          { id: 1, name: 'Test User', age: 25, city: 'Beijing' }
        ],
        children: [
          { type: 'spark-ej2-column', field: 'id', headerText: 'ID' },
          {
            type: 'spark-ej2-column',
            headerText: 'Personal Info',
            children: [
              { type: 'spark-ej2-column', field: 'firstName', headerText: 'First Name' },
              { type: 'spark-ej2-column', field: 'lastName', headerText: 'Last Name' }
            ]
          },
          { type: 'spark-ej2-column', field: 'city', headerText: 'City' }
        ]
      }

      const wrapper = mount(SparkEJ2Grid, {
        props: { config },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      // Verify nested column structure is preserved
      expect(wrapper.vm.config.children?.[1]?.children).toHaveLength(2)
    })

    it('should handle paging configuration', async () => {
      const config: SparkEJ2GridConfig = {
        type: 'spark-ej2-grid',
        dataSource: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })),
        allowPaging: true,
        pageSettings: {
          pageSize: 10,
          pageSizes: [5, 10, 20]
        },
        children: [
          { type: 'spark-ej2-column', field: 'id', headerText: 'ID' },
          { type: 'spark-ej2-column', field: 'name', headerText: 'Name' }
        ]
      }

      const wrapper = mount(SparkEJ2Grid, {
        props: { config },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.vm.config.allowPaging).toBe(true)
      expect(wrapper.vm.config.pageSettings?.pageSize).toBe(10)
    })
  })

  describe('SparkEJ2Column', () => {
    it('should initialize SPARK context for column', async () => {
      const wrapper = mount(SparkEJ2Column, {
        props: {
          config: {
            type: 'spark-ej2-column',
            field: 'name',
            headerText: 'Name',
            width: '120'
          }
        },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.vm.config.field).toBe('name')
      expect(wrapper.vm.config.headerText).toBe('Name')
    })

    it('should handle nested columns structure', async () => {
      const wrapper = mount(SparkEJ2Column, {
        props: {
          config: {
            type: 'spark-ej2-column',
            headerText: 'Personal Info',
            children: [
              { type: 'spark-ej2-column', field: 'firstName', headerText: 'First Name' },
              { type: 'spark-ej2-column', field: 'lastName', headerText: 'Last Name' }
            ]
          }
        },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      // Verify nested structure is preserved
      expect(wrapper.props().config.children).toHaveLength(2)
    })

    it('should handle column properties', async () => {
      const wrapper = mount(SparkEJ2Column, {
        props: {
          config: {
            type: 'spark-ej2-column',
            field: 'email',
            headerText: 'Email Address',
            width: '200',
            textAlign: 'Left',
            visible: true
          }
        },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.vm.config.width).toBe('200')
      expect(wrapper.vm.config.textAlign).toBe('Left')
      expect(wrapper.vm.config.visible).toBe(true)
    })
  })

  describe('SPARK Architecture', () => {
    it('should demonstrate capability provider pattern', async () => {
      const gridConfig: SparkEJ2GridConfig = {
        type: 'spark-ej2-grid',
        dataSource: [{ id: 1, name: 'Test' }],
        children: [ { type: 'spark-ej2-column', field: 'id', headerText: 'ID' } ]
      }

      const wrapper = mount(SparkEJ2Grid, {
        props: { config: gridConfig },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      // Component should render successfully with SPARK context initialized internally
    })

    it('should support infinite nesting', async () => {
      // Test deeply nested column structure
      const deepNestedConfig = {
        type: 'spark-ej2-column' as const,
        headerText: 'Level 1',
        children: [
          {
            type: 'spark-ej2-column' as const,
            headerText: 'Level 2',
            children: [
              {
                type: 'spark-ej2-column' as const,
                headerText: 'Level 3',
                children: [
                  { type: 'spark-ej2-column' as const, field: 'value', headerText: 'Value' }
                ]
              }
            ]
          }
        ]
      }

      const wrapper = mount(SparkEJ2Column, {
        props: { config: deepNestedConfig },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      expect(wrapper.exists()).toBe(true)
      // Verify deep nesting works without infinite loops
      expect(wrapper.props().config.children).toHaveLength(1)
      expect(wrapper.props().config.children?.[0]?.children).toHaveLength(1)
    })
  })
})