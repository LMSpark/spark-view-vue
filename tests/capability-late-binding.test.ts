import { describe, it, expect } from 'vitest'
import { createComponentManager } from '@spark-view/spark-core'
import type { ComponentConfig, ComponentContext, CapabilityProvider } from '@spark-view/spark-core'

const createSparkComponentManager = () => createComponentManager()

describe('Capability late-binding', () => {
  it('consumer registered before provider should be auto-connected after provider registration', () => {
    const manager = createSparkComponentManager()

    // Create a parent context and a child
    const parentConfig: ComponentConfig = { type: 'parent', id: 'parent-1' }
    const childConfig: ComponentConfig = { type: 'child', id: 'child-1' }

    const parentCtx: ComponentContext = manager.createContext(parentConfig)
    const childCtx: ComponentContext = manager.createContext(childConfig, parentCtx)

    // Simulate consumer created first
    const consumer = {
      capabilityName: 'test-cap',
      implementation: {},
      interface: {}
    }

    childCtx.consumers.set('test-cap', consumer as CapabilityConsumer)

    // Ensure no provider exists yet
    expect(manager.getProvider(childCtx, 'test-cap')).toBeUndefined()

    // Now register provider on parent via manager
    const provider: CapabilityProvider = { name: 'test-cap', version: '1.0.0', interface: {}, implementation: { foo: () => 'bar' } }
    manager.registerProvider(parentCtx, provider)

    // After register, autoConnect should have connected: check connections via manager.getProvider
    expect(manager.getProvider(childCtx, 'test-cap')).toBeTruthy()
  })
})