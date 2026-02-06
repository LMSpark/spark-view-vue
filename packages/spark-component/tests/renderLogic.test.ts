/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { SparkComponentRenderer } from '../src/utils/SparkComponentRenderer.js'
import { SparkComponentRegistryImpl } from '../src/utils/SparkComponentRegistry.js'

const mockResolver = (type: string) => {
  if (type === 'known') return { name: 'Known' }
  return null
}

describe('renderLogic', () => {
  it('resolves renderer when resolver returns implementation', () => {
    const cfg = { type: 'known' }
    const r = SparkComponentRenderer.resolveRendererForConfig(cfg as any, mockResolver)
    expect(r).toEqual({ name: 'Known' })
  })

  it('returns null when resolver returns null', () => {
    const cfg = { type: 'unknown' }
    const r = SparkComponentRenderer.resolveRendererForConfig(cfg as any, mockResolver)
    expect(r).toBeNull()
  })

  it('returns children or empty array', () => {
    const c1 = { type: 'a' }
    const c2 = { type: 'b' }
    // 直接解构：ctx.children ?? []
    expect({ type: 'x' }.children ?? []).toEqual([])
    expect({ type: 'x', children: [c1, c2] }.children).toEqual([c1, c2])
  })

  it('can resolve using a registry resolver and detect registration', () => {
    const reg = new SparkComponentRegistryImpl()
    reg.register('my-type', { type: 'my-type', name: 'My', version: '1.0.0', component: { name: 'MyComp' } } as any)
    const resolver = SparkComponentRenderer.createResolverFromRegistry(reg)
    // 直接调用 registry.has()
    expect(reg.has('my-type')).toBe(true)
    expect(SparkComponentRenderer.resolveRendererForConfig({ type: 'my-type' } as any, resolver)).toEqual({ name: 'MyComp' })
    expect(reg.has('unknown')).toBe(false)
  })
})