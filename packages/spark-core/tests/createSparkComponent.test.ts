import { describe, it, expect } from 'vitest'
import { createSparkComponent } from '../src/vue/createSparkComponent.js'
import { Spark } from '../src/spark-namespace.js'
import { createComponentRegistry, createComponentManager } from '../src/factories.js'

describe('createSparkComponent (unified factory)', () => {
  it('creates a component with spark meta that can be registered and rendered by manager', () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)

    const Comp = createSparkComponent({
      meta: { type: 'unified-type', name: 'unified', version: '0.1.0' },
      setup(_props) {
        return () => null
      }
    })

    const prevManager = (Spark as any).manager
    try {
      ;(Spark as any).manager = () => manager as any
      Spark.registerSparkComponentFromComponent(Comp as any)
    } finally { (Spark as any).manager = prevManager }

    expect(registry.has('unified-type')).toBe(true)
    const inst = manager.render({ type: 'unified-type' } as any)
    expect((inst as any).component).toBe(Comp)
  })
})