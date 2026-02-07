import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import type { CapabilityProvider, CapabilityConsumer } from '@spark-view/spark-component'

describe('Capability late-binding', () => {
  it('consumer registered before provider should be auto-connected after provider registration', () => {
    const { capabilities, createContext, rootContext } = Spark.createSystem()

    // Create a parent context and a child
    const parentCtx = createContext({ type: 'parent', id: 'parent-1' }, rootContext)
    const childCtx = createContext({ type: 'child', id: 'child-1' }, parentCtx)

    // Simulate consumer created first
    const consumer: CapabilityConsumer = {
      capabilityName: 'test-cap',
      implementation: undefined
    }
    capabilities.registerConsumer(childCtx, consumer)

    // Ensure no provider exists yet on the child's scope
    expect(capabilities.getProvider(childCtx, 'test-cap')).toBeUndefined()

    // Now register provider on parent
    const provider: CapabilityProvider = {
      name: 'test-cap',
      implementation: { foo: () => 'bar' }
    }
    capabilities.registerProvider(parentCtx, provider)

    // After registration, the provider should be discoverable by walking the parent chain
    expect(capabilities.getProvider(childCtx, 'test-cap')).toBeTruthy()
    expect(capabilities.getProvider(childCtx, 'test-cap')?.name).toBe('test-cap')
  })
})
