/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { createComponentRegistry, createSparkPlugin, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'

// Minimal fake Vue app object
function createFakeApp() {
  const provided: Record<any, unknown> = {}
  return {
    provide(key: any, value: unknown) { provided[key] = value },
    use(_p: any) {},
    config: { globalProperties: {} as any },
    _provided: provided
  } as any
}

describe('Vue plugin integration', () => {
  it('createSparkPlugin with default options uses global singleton', () => {
    const app = createFakeApp()
    const plugin = createSparkPlugin()
    plugin.install!(app)
    
    // Should provide registry and root context
    expect((app._provided)[SPARK_REGISTRY_KEY]).toBeDefined()
    expect((app._provided as any)[SPARK_PARENT_CONTEXT_KEY as symbol]).toBeDefined()
  })

  it('createSparkPlugin with custom registry uses provided registry', () => {
    const registry = createComponentRegistry()
    const plugin = createSparkPlugin({ registry })
    const app = createFakeApp()
    plugin.install!(app)
    
    // Should provide the custom registry
    expect((app._provided)[SPARK_REGISTRY_KEY]).toBe(registry)
    expect((app._provided as any)[SPARK_PARENT_CONTEXT_KEY as symbol]).toBeDefined()
  })
})
