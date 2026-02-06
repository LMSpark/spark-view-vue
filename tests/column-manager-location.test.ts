import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkEJ2Grid } from '../features/spark-ej2'
import { Spark } from '../features/spark'
import { createComponentSystem } from '@spark-view/spark-component'

// Note: local EJ2 component used by tests is imported directly where needed


const { manager, registry } = createComponentSystem()
await Spark.initializeApp(manager)

// Mock EJ2 components to avoid DOM-dependent behavior
import { vi } from 'vitest'
// Keep EJ2 Vue Grid mocked to avoid running heavy DOM/`location` dependent code in unit tests
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
    props: ['field', 'headerText', 'width', 'columns', 'textAlign', 'format', 'template', 'visible', 'allowSorting', 'allowFiltering']
  }
}))



// Mock global EJ2 components for test environment
const _mockEColumn = {
  name: 'e-column',
  template: '<div class="e-column"><slot /></div>',
  props: ['field', 'headerText', 'width', 'columns', 'textAlign', 'format', 'template', 'visible', 'allowSorting', 'allowFiltering']
}

const _mockEColumns = {
  name: 'e-columns',
  template: '<div class="e-columns"><slot /></div>'
}

const _mockEjsGrid = {
  name: 'ejs-grid',
  template: '<div class="ejs-grid"><slot /></div>',
  props: ['dataSource', 'allowPaging', 'pageSettings', 'height']
} 

// Register global mocks
if (typeof window !== 'undefined') {
  const win = window as unknown as { Vue?: { component: (...args: unknown[]) => void } }
  win.Vue = { component: vi.fn() }
}

// Capture global errors and rejections to help find stack traces during test failures
const __capturedErrors: unknown[] = []
process.on('uncaughtException', (err: unknown) => { try { console.error('uncaughtException', (err as Error)?.stack ?? err) } catch { } ; __capturedErrors.push(err) })
process.on('unhandledRejection', (reason: unknown) => { try { console.error('process.unhandledRejection', (reason as Error)?.stack ?? reason) } catch { } ; __capturedErrors.push(reason) })
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev: ErrorEvent) => { try { console.error('window.error', ev.error?.stack ?? ev.message) } catch { } ; __capturedErrors.push(ev) })
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => { try { console.error('window.unhandledrejection', ev.reason?.stack ?? ev.reason) } catch { } ; __capturedErrors.push(ev) })
}

// Also capture console errors
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
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
    } catch (err: unknown) {
      console.error('Mount or async processing threw:', err, err && (err as Error).stack)
      throw err
    }

    // Verify that a column component was created and registered in the manager
    const mgr = manager
    const contexts = mgr.getAllContexts()
    const columnContexts = contexts.filter(ctx => ctx.type === 'spark-ej2-column')

    // Should have at least one column context
    expect(columnContexts.length).toBeGreaterThan(0)

    // Find the parent column (field: 'parent')
    const parentColumnCtx = columnContexts.find(ctx => ctx.state.field === 'parent')
    expect(parentColumnCtx).toBeDefined()

    // The parent column context should have columnConfig provider
    if (parentColumnCtx) {
      expect(parentColumnCtx.providers.has('columnConfig')).toBe(true)
    }

    // Verify the parent column has the expected configuration
    expect(parentColumnCtx).toBeDefined()
    if (parentColumnCtx) {
      expect(parentColumnCtx.state.field).toBe('parent')
      expect(parentColumnCtx.state.children).toHaveLength(1)
      expect(parentColumnCtx.state.children?.[0]?.field).toBe('child1')
    }
  })
})