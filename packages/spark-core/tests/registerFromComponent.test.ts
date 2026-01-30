import { describe, it, expect } from 'vitest'
import { Spark } from '../src/spark-namespace.js'
import { createComponentRegistry, createComponentManager } from '../src/factories.js'

describe('registerSparkComponentFromComponent', () => {
  it('registers component when spark meta has type', () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)
    const comp = { render() { return null }, spark: { type: 'meta-type', name: 'meta', version: '1.2.3', providers: [{ name: 'cap', version: '1.0.0' }] } }
    // install into global manager for convenience in this test
    const prevManager = Spark.manager()
    try {
      // hijack singleton manager for test to reuse Spark namespace
      ;(Spark as any).manager = () => manager as any
      Spark.registerSparkComponentFromComponent(comp as any)
      expect(registry.has('meta-type')).toBe(true)
      const def = registry.get('meta-type')!
      expect(def.component).toBe(comp)
      expect(def.providers && def.providers.length).toBe(1)
    } finally {
      ;(Spark as any).manager = prevManager
    }
  })

  it('throws when component has no meta.type', () => {
    const comp = { render() { return null }, spark: { name: 'x' } }
    try {
      Spark.registerSparkComponentFromComponent(comp as any)
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(String(e)).toContain('component must expose spark meta')
    }
  })
})