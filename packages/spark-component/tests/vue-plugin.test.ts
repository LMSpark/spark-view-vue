/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { createComponentManager, createComponentRegistry, Spark, SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../src/index'

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
  it('Spark.install without manager should throw a helpful error', () => {
    const app = createFakeApp()
    // @ts-ignore intentionally calling without options
    expect(() => Spark.install(app)).toThrow(/requires an explicit manager/)
  })

  it('createVuePlugin installs by providing manager and registry', () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)
    const plugin = Spark.createVuePlugin({ manager, registry })
    const app = createFakeApp()
    plugin.install(app)
    expect((app._provided as any)[SPARK_MANAGER_KEY]).toBe(manager)
    expect((app._provided as any)[SPARK_REGISTRY_KEY]).toBe(registry)
  })
})
