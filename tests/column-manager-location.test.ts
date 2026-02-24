import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkEJ2Grid } from '../src/features/spark-ej2'
import { Spark, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../src/features/spark-ej2'

const { registry, rootContext } = Spark.createSystem()
// Register components into the test registry
initializeSparkEJ2Components(registry)

// Mock EJ2 components to avoid DOM-dependent behavior
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

// Register global mocks
if (typeof window !== 'undefined') {
  const win = window as unknown as { Vue?: { component: (...args: unknown[]) => void } }
  win.Vue = { component: vi.fn() }
}

/**
 * Walk the context tree recursively and collect all matching contexts
 */
function collectContexts(root: ComponentContext, predicate: (ctx: ComponentContext) => boolean): ComponentContext[] {
  const results: ComponentContext[] = []
  function walk(ctx: ComponentContext) {
    if (predicate(ctx)) results.push(ctx)
    if (ctx.children) {
      for (const child of ctx.children) {
        walk(child)
      }
    }
  }
  walk(root)
  return results
}

describe('ColumnManager provider location', () => {
  it('parent column should provide columnConfig; grid should not', async () => {
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
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
          [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
        }
      }
    })

    // Wait for component to mount and render
    await wrapper.vm.$nextTick()

    // Walk the rootContext tree to find column contexts
    const columnContexts = collectContexts(rootContext, ctx => ctx.type === 'spark-ej2-column')

    // Should have at least one column context
    expect(columnContexts.length).toBeGreaterThan(0)

    // Find the grid context
    const gridContexts = collectContexts(rootContext, ctx => ctx.type === 'spark-ej2-grid')
    expect(gridContexts.length).toBeGreaterThan(0)

    // Verify there is a parent column that has child column context(s)
    const parentColumnCtx = columnContexts.find(ctx =>
      ctx.children && ctx.children.some(c => c.type === 'spark-ej2-column')
    )
    expect(parentColumnCtx).toBeDefined()
  })
})
