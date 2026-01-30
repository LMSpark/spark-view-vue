import { describe, it, expect } from 'vitest'
import { createSparkVueComponent } from '../src/vue/SparkComponentBase.js'
import { Spark } from '../src/spark-namespace.js'
import { createComponentRegistry, createComponentManager } from '../src/factories.js'
describe('Spark Vue Base component (integration)', () => {
  it('component created with createSparkVueComponent registers and renders via manager.render', async () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)

    const Comp = createSparkVueComponent({
      meta: { type: 'base-type', name: 'base', version: '1.0.0' },
      setup(_props, _ctx) {
        return () => null
      }
    })

    // register via component meta helper
    const prevManager = (Spark as any).manager
    try {
      ;(Spark as any).manager = () => manager as any
      Spark.registerSparkComponentFromComponent(Comp as any)
    } finally {
      ;(Spark as any).manager = prevManager
    }

    // use manager.render to verify registry-driven render behavior (no .vue import in package tests)
    const instance = manager.render({ type: 'base-type', children: [] } as any)
    expect(instance).toBeTruthy()
    expect((instance as any).component).toBe(Comp)
    expect(registry.has('base-type')).toBe(true)
  })
})