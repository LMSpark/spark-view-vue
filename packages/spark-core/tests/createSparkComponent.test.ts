import { describe, it, expect } from 'vitest'
import { createSparkComponent } from '../src/vue/createSparkComponent.js'
import { Spark } from '../src/spark-namespace.js'
import { createComponentRegistry } from '../src/utils/SparkComponentRegistry.js'
import { createComponentManager } from '../src/utils/SparkComponentManager.js'

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

    const prevManager = (Spark as unknown as { manager?: () => unknown }).manager
    try {
      ;(Spark as unknown as { manager?: () => unknown }).manager = () => manager
      Spark.registerSparkComponentFromComponent(Comp as unknown as unknown)
    } finally { (Spark as unknown as { manager?: () => unknown }).manager = prevManager }

    expect(registry.has('unified-type')).toBe(true)
    const inst = manager.render({ type: 'unified-type' })
    expect((inst as { component?: unknown }).component).toBe(Comp)
  })
})