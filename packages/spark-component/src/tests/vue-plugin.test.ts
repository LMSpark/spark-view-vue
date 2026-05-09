 
import { describe, it, expect } from 'vitest'
import { Spark, SPARK_REGISTRY_KEY } from '@spark-view/spark-component'

// Minimal fake Vue app object
function createFakeApp() {
  const provided: Record<any, unknown> = {}
  return {
    provide(key: any, value: unknown) { provided[key] = value },
    use(_p: any) {},
    config: { globalProperties: {} as any },
    _context: {},
    _provided: provided
  } as any
}

describe('Vue plugin integration', () => {
  it('Spark.createPlugin with default options uses global singleton', () => {
    const app = createFakeApp()
    const plugin = Spark.createPlugin()
    plugin.install!(app)
    
    // Should provide registry
    expect((app._provided)[SPARK_REGISTRY_KEY]).toBeDefined()
  })

  it('Spark.createPlugin with custom registry uses provided registry', () => {
    const registry = Spark.createRegistry()
    const plugin = Spark.createPlugin({ registry })
    const app = createFakeApp()
    plugin.install!(app)
    
    // Should provide the custom registry
    expect((app._provided)[SPARK_REGISTRY_KEY]).toBe(registry)
  })

  it('Spark.register rejects removed path-string registration', () => {
    expect(() => Spark.register('legacy-path', './Legacy.vue')).toThrow(/Path-string registration has been removed/)
    expect(() => Spark.registerAll({ 'legacy-path': './Legacy.vue' })).toThrow(/Path-string registration has been removed/)
  })

  it('registry rejects removed function registration', () => {
    const registry = Spark.createRegistry()
    expect(() => registry.register('legacy-loader', () => Promise.resolve({ default: {} }))).toThrow(/Function registration has been removed/)
    expect(() => Spark.register('legacy-loader', () => null)).toThrow(/Function registration has been removed/)
  })

  it('Spark.normalizeNode rejects removed fallback type normalization', () => {
    expect(() => Spark.normalizeNode({ type: '' })).toThrow(/type must be a non-empty string/)
  })
})
