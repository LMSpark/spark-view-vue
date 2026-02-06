/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { createComponentRegistry, Spark, SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../src/index'

// Minimal fake Vue app object
function createFakeApp() {
  const provided: Record<any, unknown> = {}
  return {
    provide(key: any, value: unknown) { provided[key] = value },
    use(_p: any) {},
    _provided: provided
  } as any
}

describe('Vue plugin integration', () => {
  it('createVuePlugin with default options uses global singleton', () => {
    const app = createFakeApp()
    const plugin = Spark.createVuePlugin()
    plugin.install(app)
    
    // Should provide manager and registry
    expect((app._provided)[SPARK_MANAGER_KEY]).toBeDefined()
    expect((app._provided)[SPARK_REGISTRY_KEY]).toBeDefined()
  })

  it('createVuePlugin with custom registry creates matching manager', () => {
    const registry = createComponentRegistry()
    const plugin = Spark.createVuePlugin({ registry })
    const app = createFakeApp()
    plugin.install(app)
    
    // Should provide manager and the custom registry
    expect((app._provided)[SPARK_MANAGER_KEY]).toBeDefined()
    expect((app._provided)[SPARK_REGISTRY_KEY]).toBe(registry)
  })
})
