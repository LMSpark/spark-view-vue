import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import type { CapabilityProvider } from '@spark-view/spark-component'

describe('Provider listeners', () => {
  it('listener is invoked when provider is registered', () => {
    const { capabilities, createContext, rootContext } = Spark.createSystem()

    const parentCtx = createContext({ type: 'parent', id: 'parent-listen' }, rootContext)

    // Attach listener before provider registration
    parentCtx.providerListeners = new Map()
    parentCtx.providerListeners.set('foo', new Set())

    let called = false
    const listeners = parentCtx.providerListeners.get('foo')!
    listeners.add((prov: CapabilityProvider) => {
      called = true
      expect(prov.name).toBe('foo')
    })

    const provider: CapabilityProvider = { name: 'foo', implementation: {} }
    capabilities.registerProvider(parentCtx, provider)

    expect(called).toBe(true)
  })

  it('listener on child is invoked when provider is registered on parent', () => {
    const { capabilities, createContext, rootContext } = Spark.createSystem()

    const parentCtx = createContext({ type: 'parent', id: 'parent-2' }, rootContext)
    const childCtx = createContext({ type: 'child', id: 'child-2' }, parentCtx)

    // Attach listener on child
    childCtx.providerListeners = new Map()
    childCtx.providerListeners.set('bar', new Set())

    let receivedProvider: CapabilityProvider | null = null
    childCtx.providerListeners.get('bar')!.add((prov: CapabilityProvider) => {
      receivedProvider = prov
    })

    const provider: CapabilityProvider = { name: 'bar', implementation: { value: 42 } }
    capabilities.registerProvider(parentCtx, provider)

    expect(receivedProvider).not.toBeNull()
    expect(receivedProvider!.name).toBe('bar')
  })
})
