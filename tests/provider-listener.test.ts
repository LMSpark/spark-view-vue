import { describe, it, expect } from 'vitest'
import { SparkComponentManagerImpl } from '@spark-view/spark-core'
import type { ComponentConfig, ComponentContext, CapabilityProvider } from '@spark-view/spark-core'

const createSparkComponentManager = () => new SparkComponentManagerImpl()

describe('Provider listeners', () => {
  it('listener is invoked when provider is registered', () => {
    const manager = createSparkComponentManager()

    const parentConfig: ComponentConfig = { type: 'parent', id: 'parent-listen' }
    const parentCtx: ComponentContext = manager.createContext(parentConfig as any)

    // attach listener
    if (!parentCtx.providerListeners) parentCtx.providerListeners = new Map()
    parentCtx.providerListeners.set('foo', new Set())

    let called = false
    parentCtx.providerListeners.get('foo')!.add((prov: CapabilityProvider) => { called = true; expect(prov.name).toBe('foo') })

    const provider: CapabilityProvider = { name: 'foo', version: '1.0.0', interface: {}, implementation: {} }
    manager.registerProvider(parentCtx, provider)

    expect(called).toBe(true)
  })
})