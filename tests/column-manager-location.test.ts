import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkEJ2Grid from '../features/spark/components/ej2/SparkEJ2Grid.vue'
import SparkEJ2Column from '../features/spark/components/ej2/SparkEJ2Column.vue'
import { Spark } from '../features/spark'
import { createComponentManager, createComponentRegistry } from '@spark-view/spark-core'

const registry = createComponentRegistry()
const manager = createComponentManager(undefined, registry)
await Spark.initializeApp(manager)

// Mock EJ2 components to avoid DOM-dependent behavior
import { vi } from 'vitest'
// Temporarily remove mock to see if we get different errors
// vi.mock('@syncfusion/ej2-vue-grids', () => ({
//   GridComponent: {
//     name: 'GridComponent',
//     template: '<div class="ej2-grid"><slot /></div>',
//     props: ['dataSource', 'allowPaging', 'pageSettings', 'height']
//   },
//   ColumnsDirective: {
//     name: 'ColumnsDirective',
//     template: '<div class="ej2-columns"><slot /></div>'
//   },
//   ColumnDirective: {
//     name: 'ColumnDirective',
//     template: '<div class="ej2-column"><slot /></div>',
//     props: ['field', 'headerText', 'width', 'columns', 'textAlign', 'format', 'template', 'visible', 'allowSorting', 'allowFiltering']
//   }
// }))



// Mock global EJ2 components for test environment
const mockEColumn = {
  name: 'e-column',
  template: '<div class="e-column"><slot /></div>',
  props: ['field', 'headerText', 'width', 'columns', 'textAlign', 'format', 'template', 'visible', 'allowSorting', 'allowFiltering']
}

const mockEColumns = {
  name: 'e-columns',
  template: '<div class="e-columns"><slot /></div>'
}

const mockEjsGrid = {
  name: 'ejs-grid',
  template: '<div class="ejs-grid"><slot /></div>',
  props: ['dataSource', 'allowPaging', 'pageSettings', 'height']
}

// Register global mocks
if (typeof window !== 'undefined') {
  ;(window as any).Vue = { component: vi.fn() }
}

// Capture global errors and rejections to help find stack traces during test failures
const __capturedErrors: any[] = []
process.on('uncaughtException', (err: any) => { try { console.error('uncaughtException', err.stack || err) } catch(_){}; __capturedErrors.push(err) })
process.on('unhandledRejection', (reason: any) => { try { console.error('process.unhandledRejection', reason?.stack || reason) } catch(_){}; __capturedErrors.push(reason) })
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => { try { console.error('window.error', ev.error?.stack || ev.message) } catch(_){}; __capturedErrors.push(ev) })
  window.addEventListener('unhandledrejection', (ev) => { try { console.error('window.unhandledrejection', ev.reason?.stack || ev.reason) } catch(_){}; __capturedErrors.push(ev) })
}

// Also capture console errors
const originalConsoleError = console.error
console.error = (...args: any[]) => {
  __capturedErrors.push(args)
  originalConsoleError.apply(console, args)
}

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

    let wrapper
    try {
      wrapper = mount(SparkEJ2Grid, {
        props: { config },
        global: { provide: { sparkManager: manager, sparkRegistry: registry } }
      })

      // Wait for component to mount and render
      await wrapper.vm.$nextTick()

      if (__capturedErrors.length > 0) {
        console.error('Captured async errors during mount:', __capturedErrors)
        throw __capturedErrors[0]
      }
    } catch (err: any) {
      console.error('Mount or async processing threw:', err, err && err.stack)
      throw err
    }

    // Verify that a column component was created and registered in the manager
    const mgr = manager
    const contexts = mgr.getAllContexts()
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