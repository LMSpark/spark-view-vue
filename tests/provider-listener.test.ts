import { describe, it, expect } from 'vitest'
import { createComponentManager } from '@spark-view/spark-component'
import type { ComponentConfig, ComponentContext, CapabilityProvider } from '@spark-view/spark-component'

const createSparkComponentManager = () => createComponentManager()

describe('Provider listeners', () => {
  it('listener is invoked when provider is registered', () => {
    const manager = createSparkComponentManager()

    const parentConfig: ComponentConfig = { type: 'parent', id: 'parent-listen' }
    const parentCtx: ComponentContext = manager.createContext(parentConfig)

    // attach listener
    parentCtx.providerListeners ??= new Map()
    parentCtx.providerListeners.set('foo', new Set())

    let called = false
    const listeners = parentCtx.providerListeners.get('foo')
    if (listeners) {
      listeners.add((prov: CapabilityProvider) => { called = true; expect(prov.name).toBe('foo') })
    }

    const provider: CapabilityProvider = { name: 'foo', version: '1.0.0', implementation: {} }
    manager.registerProvider(parentCtx, provider)

    expect(called).toBe(true)
  })
})