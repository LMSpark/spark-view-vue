import { describe, it, expect } from 'vitest'
import { SparkComponentManagerImpl } from '@spark-view/spark-core'

const createSparkComponentManager = () => new SparkComponentManagerImpl()

describe('Provider listeners', () => {
  it('listener is invoked when provider is registered', () => {
    const manager = createSparkComponentManager()

    const parentConfig: any = { type: 'parent', id: 'parent-listen' }
    const parentCtx: any = manager.createContext(parentConfig)

    // attach listener
    if (!parentCtx.providerListeners) parentCtx.providerListeners = new Map()
    parentCtx.providerListeners.set('foo', new Set())

    let called = false
    parentCtx.providerListeners.get('foo')!.add((provider: any) => { called = true; expect(provider.name).toBe('foo') })

    const provider = { name: 'foo', version: '1.0.0', interface: {}, implementation: {} }
    manager.registerProvider(parentCtx, provider as any)

    expect(called).toBe(true)
  })
})