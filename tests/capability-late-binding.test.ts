import { describe, it, expect } from 'vitest'
import { SparkComponentManagerImpl } from '@spark-view/spark-core'

const createSparkComponentManager = () => new SparkComponentManagerImpl()

describe('Capability late-binding', () => {
  it('consumer registered before provider should be auto-connected after provider registration', () => {
    const manager = createSparkComponentManager()

    // Create a parent context and a child
    const parentConfig: any = { type: 'parent', id: 'parent-1' }
    const childConfig: any = { type: 'child', id: 'child-1' }

    const parentCtx: any = manager.createContext(parentConfig)
    const childCtx: any = manager.createContext(childConfig, parentCtx)

    // Simulate consumer created first
    const consumer = {
      capabilityName: 'test-cap',
      implementation: {},
      interface: {}
    }

    childCtx.consumers.set('test-cap', consumer)

    // Ensure no provider exists yet
    expect(manager.getProvider(childCtx, 'test-cap')).toBeUndefined()

    // Now register provider on parent via manager
    const provider = { name: 'test-cap', version: '1.0.0', interface: {}, implementation: { foo: () => 'bar' } }
    manager.registerProvider(parentCtx, provider as any)

    // After register, autoConnect should have connected: check connections via manager.getProvider
    expect(manager.getProvider(childCtx, 'test-cap')).toBeTruthy()
  })
})