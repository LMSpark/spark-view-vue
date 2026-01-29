import { describe, it, expect } from 'vitest'
import { registerGlobalProvider, getGlobalProvider, getOrCreateNoopProvider } from '../src/utils/GlobalProviderRegistry.js'

describe('GlobalProviderRegistry', () => {
  it('register and get provider', () => {
    const p = { name: 'test', implementation: {} }
    registerGlobalProvider('test', p as any)
    const got = getGlobalProvider('test')
    expect(got).toBe(p)
  })

  it('getOrCreateNoopProvider creates provider', () => {
    const p = getOrCreateNoopProvider('noop')
    expect(p.name).toBe('noop')
    expect(p.implementation).toBeDefined()
  })
})